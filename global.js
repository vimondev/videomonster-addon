const fs = require(`fs`)
const config = require(`./config`)
const {
    fontPath
} = config

function AccessAsync(path) {
    return new Promise((resolve, reject) => {
        fs.access(path, err => {
            if (err) resolve(false)
            else resolve(true)
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

exports.InstallFont = async (path) => {
    if (await AccessAsync(fontPath) && await AccessAsync(path)) {
        const files = await ReadDirAsync(path)
        for (let i=0; i<files.length; i++) {
            const file = files[i]
            if (!(await AccessAsync(`${fontPath}/${file}`))) {
                await CopyFileAsync(`${path}/${file}`, `${fontPath}/${file}`)
                console.log(`${file} is installed!`)
            }
            else 
                console.log(`${file} is already installed.`)
        }
    }
}