async function func() {
    const fs = require(`fs`)

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

    function DeleteMediaCache() {
        return new Promise(resolve => {
            const mediaCacheDir = require('os').homedir() + '\\AppData\\Roaming\\Adobe\\Common\\Media Cache Files'
            
            fs.access(mediaCacheDir, err => {
                if (err) return resolve()
    
                fs.readdir(mediaCacheDir, (err, files) => {
                    if (err) return resolve()
    
                    files.forEach(file => {
                        fs.unlinkSync(mediaCacheDir + '\\' + file)
                    })
    
                    resolve()
                })
            })
        })
    }

    const config = require(`./config`)
    const global = require(`./global`)
    const scriptExecutor = require(`./modules/scriptExecutor`)
    
    // 이미지 렌더링 수행중?
    let isImageRendering = false
    let isMaterialParsing = false

    // 시작 전에 VM DEVICE에 생성된 TOKEN_ID 파일이 있는지 검사한다. 있으면 그대로 사용한다.
    let token = ``
    if (await AccessAsync(config.tokenPath)) {
        token = await ReadFileAsync(config.tokenPath, 'utf8')
        console.log(token)
    }
    // 없으면 TOKEN_ID를 새로 하나 생성하여 LOCAL에 저장한다.
    else {
        token = require(`guid`).create().value
        await WriteFileAsync(config.tokenPath, token)
    }

    console.log(`start!`)

    await DeleteMediaCache()

    const socket = require(`socket.io-client`)(`http://10.0.0.7:3000`, {
        transports: [`websocket`],
        query: {
            token: token
        }
    })

    // branch test

    socket.on(`connect`, () => {
        console.log(`Connected!`)
        console.log(`imageclient`)
        socket.emit(`regist`, `imageclient`)
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
            ReplaceSourcePath,
            gettyImagesPath,
            TemplateId
        } = data
        console.log(data)

        try {
            // 폰트 설치
            await global.InstallFont(fontPath)

            // Path 설정 후 렌더링
            scriptExecutor.SetPath(Template_path, Material_Json, ReplaceSourcePath, gettyImagesPath, TemplateId)
            const ae_log = await scriptExecutor.CreatePreviewImage(imagePath)

            socket.emit(`image_render_completed`, {
                ae_log,
                errCode: null
            })
        }
        catch (e) {
            socket.emit(`image_render_completed`, {
                ae_log: null,
                errCode: e
            })
        }
        isImageRendering = false
    })

    socket.on(`material_parse_start`, async data => {
        isMaterialParsing = true
        const {
            fontPath,

            Template_path,
            Material_Json,
            ReplaceSourcePath,
            gettyImagesPath,
            TemplateId
        } = data
        console.log(data)

        try {
            // 폰트 설치
            await global.InstallFont(fontPath)

            // Path 설정 후 렌더링
            scriptExecutor.SetPath(Template_path, Material_Json, ReplaceSourcePath, gettyImagesPath, TemplateId)
            const ae_log = await scriptExecutor.MaterialParse()

            socket.emit(`material_parse_completed`, {
                ae_log,
                errCode: null
            })
        }
        catch (e) {
            socket.emit(`material_parse_completed`, {
                ae_log: null,
                errCode: e
            })
        }
        isMaterialParsing = false
    })
}
func()