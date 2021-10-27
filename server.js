let express = require('express')
let app = express()
let formidable = require('formidable')
let path = require('path')
let uploadDir = 'nodeServer/uploads'
let fs = require('fs-extra')
let concat = require('concat-files')

// 处理跨域
app.all('*', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
      'Access-Control-Allow-Headers',
      'Content-Type,Content-Length, Authorization, Accept,X-Requested-With'
  )
  res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS')
  res.header('X-Powered-By', ' 3.2.1')
  if (req.method === 'OPTIONS') res.send(200) /*让options请求快速返回*/
  else next()
})

// 列出文件夹下所有文件
function listDir(path) {
  return new Promise((resolve, reject) => {
      fs.readdir(path, (err, data) => {
          if (err) {
              reject(err)
              return
          }
          // 把mac系统下的临时文件去掉
          if (data && data.length > 0 && data[0] === '.DS_Store') {
              data.splice(0, 1)
          }
          resolve(data)
      })
  })
}

// 文件或文件夹是否存在
function isExist(filePath) {
  return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
          // 文件不存在
          if (err && err.code === 'ENOENT') {
              resolve(false)
          } else {
              resolve(true)
          }
      })
  })
}

// 获取文件Chunk列表
async function getChunkList(filePath, folderPath, callback) {
  let isFileExit = await isExist(filePath)
  let result = {}
  // 如果文件已在存在, 不用再继续上传, 真接秒传
  if (isFileExit) {
      result = {
          stat: 1,
          file: {
              isExist: true,
              name: filePath
          },
          desc: 'file is exist'
      }
  } else {
      let isFolderExist = await isExist(folderPath)
      // 如果文件夹(md5值后的文件)存在, 就获取已经上传的块
      let fileList = []
      if (isFolderExist) {
          fileList = await listDir(folderPath)
      }
      result = {
          stat: 1,
          chunkList: fileList,
          desc: 'folder list'
      }
  }
  callback(result)
}

/**
 * 检查md5
 */
app.get('/check/file', (req, resp) => {
  let query = req.query
  let fileName = query.fileName
  let fileMd5Value = query.fileMd5Value
  // 获取文件Chunk列表
  getChunkList(
      path.join(uploadDir, fileName),
      path.join(uploadDir, fileMd5Value),
      data => {
          resp.send(data)
      }
  )
})

app.all('/upload', (req, resp) => {
  const form = new formidable.IncomingForm({
      uploadDir: 'nodeServer/tmp'
  })
  form.parse(req, function(err, fields, file) {
      let index = fields.index
      let fileMd5Value = fields.fileMd5Value
      let folder = path.resolve(__dirname, 'nodeServer/uploads', fileMd5Value)
      folderIsExit(folder).then(val => {
          let destFile = path.resolve(folder, fields.index)
          copyFile(file.data.path, destFile).then(
              successLog => {
                  resp.send({
                      stat: 1,
                      desc: index
                  })
              },
              errorLog => {
                  resp.send({
                      stat: 0,
                      desc: 'Error'
                  })
              }
          )
      })
  })
  
  // 文件夹是否存在, 不存在则创建文件
  function folderIsExit(folder) {
      return new Promise(async (resolve, reject) => {
          await fs.ensureDirSync(path.join(folder))
          resolve(true)
      })
  }
  // 把文件从一个目录拷贝到别一个目录
  function copyFile(src, dest) {
      let promise = new Promise((resolve, reject) => {
          fs.rename(src, dest, err => {
              if (err) {
                  reject(err)
              } else {
                  resolve('copy file:' + dest + ' success!')
              }
          })
      })
      return promise
  }
})

// 合并文件
async function mergeFiles(srcDir, targetDir, newFileName) {
  let fileArr = await listDir(srcDir)
  fileArr.sort((x,y) => {
      return x-y;
  })
  // 把文件名加上文件夹的前缀
  for (let i = 0; i < fileArr.length; i++) {
      fileArr[i] = srcDir + '/' + fileArr[i]
  }
  concat(fileArr, path.join(targetDir, newFileName), err => {
      if(err) {
          return false
      }
      return true
  })
}

// 合成
app.all('/merge', (req, resp) => {
  let query = req.query
  let md5 = query.md5
  let fileName = query.fileName
  const res = mergeFiles(path.join(uploadDir, md5), uploadDir, fileName)
  resp.send({
      stat: res ? 1 : 0
  })
})

app.listen(1111, () => {
  console.log('服务启动完成，端口监听1111！')
})