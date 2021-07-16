async function func() {
    const fs = require(`fs`)
    const config = require(`./config`)
    const global = require(`./global`)
    const scriptExecutor = require(`./modules/scriptExecutor`)
    const fsAsync = require(`./modules/fsAsync`)
    const { v4: uuid } = require('uuid')
    const git = require('simple-git')()
    require('dotenv').config()
  
    async function GetTargetRenderServerIp() {
        try {
          const isStaticMachine = process.env.IS_STATIC_MACHINE === 'true'
          const { current } = await git.status()
          switch(current) {
            case 'master':
              if (isStaticMachine) return 'http://videomonsterdevs.koreacentral.cloudapp.azure.com:3000'
              return 'http://10.0.0.7:3000'
            case 'dev':
              if (isStaticMachine) return 'http://videomonsterdevs.koreacentral.cloudapp.azure.com:3000'
              return 'http://10.0.0.19:3000'

            default: 
              console.log(`[ERROR] Target Server Ip is null. (Branch : ${current})`)
              return null
          }
        }
        catch (e) {
          console.log(e)
          return null
        }
    }
    
    async function CreateAndReadToken() {
        try {
            const tokenPath = 'C:/Users/Public/token.txt'
            if(!await fsAsync.IsExistAsync(tokenPath)) {
                await fsAsync.WriteFileAsync(tokenPath, uuid())
            }
            const token = await fsAsync.ReadFileAsync(tokenPath)
            return String(token)
        }
        catch(e) {
            console.log(e)
            return ""
        }
    }

    function AccessAsync(path) {
        return new Promise((resolve, reject) => {
            fs.access(path, err => {
                if (err) resolve(false)
                else resolve(true)
            })
        })
    }

    function ReadFileAsync(path, options) {
        return new Promise((resolve, reject) => {
            fs.readFile(path, options, (err, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        })
    }

    function WriteFileAsync(path, data) {
        return new Promise((resolve, reject) => {
            fs.writeFile(path, data, err => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    function MkdirAsync(path) {
        return new Promise((resolve, reject) => {
            fs.mkdir(path, err => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async function createFolder(folderPath) {
        try {
            if (!await AccessAsync(folderPath)) {
                await MkdirAsync(folderPath)
            }
        }
        catch (e) {
            console.log(e)
        }
    }

    // 이미지 렌더링 수행중?
    let isImageRendering = false
    let isMaterialParsing = false

    let renderServerIp = await GetTargetRenderServerIp()
    if(!renderServerIp) console.log(`[Error] RenderServerIp not found.`)

    const rendererid = await CreateAndReadToken()

    console.log(`start! / rendererid(${rendererid}) / targetServerIp(${renderServerIp})`)

    await DeleteMediaCache()
    
    const socket = require(`socket.io-client`)(renderServerIp, {
        transports: [`websocket`]
    })

    // branch test
    socket.on(`connect`, () => {
        console.log(`Connected!`)
        console.log(`imageclient`)
        socket.emit(`regist`, { type:`imageclient`, rendererid })
    })

    socket.on(`disconnect`, () => {
        console.log(`Disconnected!`)
    })

    // 렌더 서버에서 클라이언트가 네트워크 문제 등의 이유로 재접속 되었을 때, 작업을 수행중인지 물어본다.
    // 만약 작업을 수행하고 있지 않다면 (VM이 재부팅되거나, 프로세스가 다시 시작되었을 경우) 에러 코드를 서버에 전송한다.
    // Image Rendering 수행 여부 확인
    socket.on(`is_stopped_image_rendering`, () => {
        if (isImageRendering == false) {
            socket.emit(`image_render_completed`, {
                ae_log: null,
                errCode: `ERR_IMAGE_RENDER_STOPPED`
            })
        }
    })

    socket.on(`is_stopped_material_parsing`, () => {
        if (isMaterialParsing == false) {
            socket.emit(`material_parse_completed`, {
                ae_log: null,
                errCode: `ERR_MATERIAL_PARSE_STOPPED`
            })
        }
    })

    // 이미지 렌더링 시작
    socket.on(`image_render_start`, async data => {
        isImageRendering = true
        const {
            fontPath,
            imagePath,

            Template_path,
            Material_Json,
            EditableData,
            ReplaceSourcePath,
            gettyImagesPath,
            TemplateId,

            installFontMap
        } = data
        console.log(data)

        try {
            await global.ClearTask()
            
            // 폰트 설치
            if (fsAsync.IsExistAsync(config.fontPath)) await fsAsync.UnlinkFolderRecursive(config.fontPath)
            await createFolder(config.fontPath)

            await global.InstallFont(fontPath)
            if (typeof installFontMap === 'object') await global.InstallGlobalFont(installFontMap)

            // Path 설정 후 렌더링
            scriptExecutor.SetPath(Template_path, Material_Json, ReplaceSourcePath, gettyImagesPath, TemplateId, EditableData)
            const ae_log = await scriptExecutor.CreatePreviewImage(imagePath)

            await fsAsync.WriteFileAsync(`${imagePath}/ae_log.txt`, ae_log)

            socket.emit(`image_render_completed`, {
                ae_log,
                errCode: null
            })
        }
        catch (e) {
            socket.emit(`image_render_completed`, {
                ae_log: null,
                errCode: String(e)
            })
        }
        isImageRendering = false
    })

    socket.on(`material_parse_start`, async data => {
        isMaterialParsing = true
        const {
            fontPath,
            imagePath,

            Template_path,
            Material_Json,
            EditableData,
            ReplaceSourcePath,
            gettyImagesPath,
            TemplateId,

            installFontMap
        } = data
        console.log(data)

        try {
            await global.ClearTask()

            // 폰트 설치
            if (fsAsync.IsExistAsync(config.fontPath)) await fsAsync.UnlinkFolderRecursive(config.fontPath)
            await createFolder(config.fontPath)
            
            await global.InstallFont(fontPath)
            if (typeof installFontMap === 'object') await global.InstallGlobalFont(installFontMap)

            // Path 설정 후 렌더링
            scriptExecutor.SetPath(Template_path, Material_Json, ReplaceSourcePath, gettyImagesPath, TemplateId, EditableData)
            const ae_log = await scriptExecutor.MaterialParse(imagePath)

            await fsAsync.WriteFileAsync(`${imagePath}/ae_log.txt`, ae_log)

            socket.emit(`material_parse_completed`, {
                ae_log,
                errCode: null
            })
        }
        catch (e) {
            socket.emit(`material_parse_completed`, {
                ae_log: null,
                errCode: String(e)
            })
        }
        isMaterialParsing = false
    })
}
func()