const fs = require(`fs`)
const io = require(`io-info`)
const { execFile } = require(`child_process`)
const config = require(`../config`)
const path = require('path')
const {
    aerenderPath,
    localPath
} = config
const { retry, ClearTask } = require('../global')
const fsAsync = require('./fsAsync')

const Save_path = localPath
const ScriptRoot_path = __dirname.replace('modules', 'Scripts').replace(/\\/gi, '/')

let Template_path
let Material_Json
let ReplaceSourcePath
let GettyImagesPath
let TemplateId
let EditableData

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function AccessAsync(path) {
    return new Promise((resolve, reject) => {
        fs.access(path, err => {
            if(err) resolve(false)
            else resolve(true)
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

function ReadDirAsync(path) {
    return new Promise((resolve, reject) => {
        fs.readdir(path, (err, files) => {
            if (err) reject(err)
            else resolve(files)
        })
    })
}

function CopyFileAsync(src, dest) {
    return new Promise((resolve, reject) => {
        fs.copyFile(src, dest, err => {
            resolve()
        })
    })
}

function UnlinkAsync(path) {
    return new Promise((resolve, reject) => {
        fs.unlink(path, err => {
            if (err) reject(err)
            else resolve()
        })
    })
}

function RmDirAsync(path) {
    return new Promise((resolve, reject) => {
        fs.rmdir(path, err => {
            if (err) reject(err)
            else resolve()
        })
    })
}

// Rendering을 수행할 Path 설정
exports.SetPath = (_Template_path, _Material_Json, _ReplaceSourcePath, _GettyImagesPath, _TemplateId, _EditableData) => {
    Template_path = _Template_path
    Material_Json = _Material_Json
    ReplaceSourcePath = _ReplaceSourcePath
    GettyImagesPath = _GettyImagesPath
    TemplateId = _TemplateId
    EditableData = _EditableData
}

// 이미지 렌더링
exports.CreatePreviewImage = (imagePath) => {
    return new Promise(async (resolve, reject) => {
        try {
            const homeDir = `${require('os').homedir()}/AppData`
            await fsAsync.UnlinkFolderRecursiveIgnoreError(`${homeDir}/Local/Temp`)
            await fsAsync.UnlinkFolderRecursiveIgnoreError(`${homeDir}/Roaming/Adobe/Common`)

            console.log(`[ ----- DEBUG ----- ] CreatePreviewImage / Unlink Temp Files`)
            
            let ae_log = ``

            // 기존 파일 제거
            let localPath = `${Save_path}/${TemplateId}`
            if (await AccessAsync(localPath)) {
                const files = await ReadDirAsync(localPath)
                for (let i=0; i<files.length; i++) {
                    if (await AccessAsync(`${localPath}/${files[i]}`)) {
                        await UnlinkAsync(`${localPath}/${files[i]}`)
                    }
                }
            }
            // 기존에 생성된 폴더가 없을 경우 생성
            else await MkdirAsync(localPath)

            console.log(`[ ----- DEBUG ----- ] CreatePreviewImage / Unlink or Mkdir ${localPath}`)

            // 스크립트 로드 & Replace
            let script = io.FileInfo.readAllText(`${ScriptRoot_path}/createPreviewImage.jsx`)
            script = script.replace('${ProjectPath}', Template_path);
            script = script.replace('${Json2Path}', `${ScriptRoot_path}/json2.js`);
            script = script.replace('${ScriptRootPath}', ScriptRoot_path)
            script = script.replace('${Material}', Material_Json);
            script = script.replace('${EditableData}', EditableData);
            script = script.replace('${ReplaceSourcePath}', ReplaceSourcePath);
            script = script.replace('${gettyImagesPath}', GettyImagesPath)
            script = script.replace('${ResultPath}', localPath)
            
            const scriptPath = `${require('os').homedir()}/aescript.js`
            await fsAsync.WriteFileAsync(scriptPath, script)

            console.log(`[ ----- DEBUG ----- ] CreatePreviewImage / WriteFile aescript.js`)

            // 이미지 렌더링 시작
            const child = execFile(`${aerenderPath}/AfterFX.com`, ['-r', scriptPath, '-noui'])

            const startTime = Date.now()

            let isStucked = false
            let interval
            function CheckAfterFXStuck() {
                if (Date.now() - startTime > 1000 * 60 * 9) {
                    ClearTask().catch(() => {})
                    isStucked = true
                    reject(new Error())
                    if (interval) clearInterval(interval)
                }
            }

            child.stdout.on('data', data => {
                ae_log += String(data)
                console.log(String(data))
            })
            
            child.stderr.on('data', data => {
                ae_log += String(data)
                console.log(String(data))
            })

            child.on('close', async code => {                
                try {
                    console.log(`[ ----- DEBUG ----- ] CreatePreviewImage / Finish AfterFx.com - 1 (${isStucked})`)

                    if (!isStucked) {
                        if (interval) clearInterval(interval)

                        if (imagePath) {
                            if (await AccessAsync(imagePath)) {
                                const files = await retry(ReadDirAsync(imagePath))
                                for (let i = 0; i < files.length; i++) {
                                    if (await AccessAsync(`${imagePath}/${files[i]}`)) {
                                        await retry(UnlinkAsync(`${imagePath}/${files[i]}`))
                                    }
                                }
                            }
                            else await retry(MkdirAsync(imagePath))
                        }

                        console.log(`[ ----- DEBUG ----- ] CreatePreviewImage / Finish AfterFx.com - 2`)

                        // 렌더링이 완료된 파일을 찾는다. (localPath에 저장됨.)
                        const files = await retry(ReadDirAsync(localPath))
                        for (let i = 0; i < files.length; i++) {
                            let fileName = files[i]

                            // _ 제거 후 원격지에 저장한다. 원본 파일은 삭제한다.
                            if (imagePath) {
                                await retry(CopyFileAsync(`${localPath}/${files[i]}`, `${imagePath}/${fileName}`))
                            }
                            await retry(UnlinkAsync(`${localPath}/${files[i]}`))
                        }
                        // 로컬 폴더는 이제 삭제한다.
                        await retry(RmDirAsync(localPath))
                    }

                    resolve(ae_log)
                }
                catch (e) {
                    console.log(e)
                    reject(e)
                }
            })

            await sleep(10000)
            interval = setInterval(CheckAfterFXStuck, 1000)
        }
        catch (e) {
            console.log(e)
            reject(e)
        }
    })
}

// AEP 파일 생성
exports.MaterialParse = (imagePath) => {
    return new Promise(async (resolve, reject) => {
        try {
            const homeDir = `${require('os').homedir()}/AppData`
            await fsAsync.UnlinkFolderRecursiveIgnoreError(`${homeDir}/Local/Temp`)
            await fsAsync.UnlinkFolderRecursiveIgnoreError(`${homeDir}/Roaming/Adobe/Common`)

            let ae_log = ``

            // 기존 파일 제거
            let localPath = `${Save_path}/${TemplateId}`
            if (await AccessAsync(localPath)) {
                const files = await ReadDirAsync(localPath)
                for (let i=0; i<files.length; i++) {
                    if (await AccessAsync(`${localPath}/${files[i]}`)) {
                        await UnlinkAsync(`${localPath}/${files[i]}`)
                    }
                }
            }
            // 기존에 생성된 폴더가 없을 경우 생성
            else await MkdirAsync(localPath)

            // 스크립트 로드 & Replace
            let script = io.FileInfo.readAllText(`${ScriptRoot_path}/materialParse.js`)
            script = script.replace('${ProjectPath}', Template_path);
            script = script.replace('${Json2Path}', `${ScriptRoot_path}/json2.js`);
            script = script.replace('${ScriptRootPath}', ScriptRoot_path)
            script = script.replace('${Material}', Material_Json);
            script = script.replace('${EditableData}', EditableData);
            script = script.replace('${ReplaceSourcePath}', ReplaceSourcePath);
            script = script.replace('${gettyImagesPath}', GettyImagesPath)
            script = script.replace('${ResultPath}', localPath)
            
            const scriptPath = `${require('os').homedir()}/aescript.js`
            await fsAsync.WriteFileAsync(scriptPath, script)

            // 이미지 렌더링 시작
            const child = execFile(`${aerenderPath}/AfterFX.com`, ['-r', scriptPath, '-noui'])

            const startTime = Date.now()
            
            let isStucked = false
            let interval
            function CheckAfterFXStuck() {
                if (Date.now() - startTime > 1000 * 60 * 9) {
                    ClearTask().catch(() => {})
                    isStucked = true
                    reject(new Error())
                    if (interval) clearInterval(interval)
                }
            }

            child.stdout.on('data', data => {
                ae_log += String(data)
                console.log(String(data))
            })
            
            child.stderr.on('data', data => {
                ae_log += String(data)
                console.log(String(data))
            })

            child.on('close', async code => {
                try {
                    if (!isStucked) {
                        if (interval) clearInterval(interval)

                        if (imagePath) {
                            if (await AccessAsync(imagePath)) {
                                const files = await retry(ReadDirAsync(imagePath))
                                for (let i = 0; i < files.length; i++) {
                                    if (await AccessAsync(`${imagePath}/${files[i]}`)) {
                                        await retry(UnlinkAsync(`${imagePath}/${files[i]}`))
                                    }
                                }
                            }
                            else await retry(MkdirAsync(imagePath))
                        }
    
                        // 렌더링이 완료된 파일을 찾는다. (localPath에 저장됨.)
                        const files = await retry(ReadDirAsync(localPath))
                        for (let i=0; i<files.length; i++) {
                            let fileName = files[i]
    
                            // _ 제거 후 원격지에 저장한다. 원본 파일은 삭제한다.
                            if (imagePath) {
                                await retry(CopyFileAsync(`${localPath}/${files[i]}`, `${imagePath}/${fileName}`))
                            }
                            await retry(UnlinkAsync(`${localPath}/${files[i]}`))
                        }
                        // 로컬 폴더는 이제 삭제한다.
                        await retry(RmDirAsync(localPath))
                    }

                    resolve(ae_log)
                }
                catch (e) {
                    console.log(e)
                    reject(e)
                }
            })

            await sleep(10000)
            interval = setInterval(CheckAfterFXStuck, 1000)
        }
        catch (e) {
            console.log(e)
            reject(e)
        }
    })
}