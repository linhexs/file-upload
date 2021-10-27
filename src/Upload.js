import React, { useRef, useEffect, useState, useReducer } from 'react'
import { Button, Progress, message } from 'antd';
import { SlideDown } from 'react-slidedown'
import SparkMD5 from 'spark-md5'
import 'react-slidedown/lib/slidedown.css'
import './style.css'
import axios from 'axios'

const BaseUrl = 'http://localhost:1111'

const initialState = { checkPercent: 0, uploadPercent: 0 };

function reducer(state, action) {
  switch (action.type) {
    case 'check':
      initialState.checkPercent = action.checkPercent
      return { ...initialState }
    case 'upload':
      initialState.uploadPercent = action.uploadPercent
      return { ...initialState }
    case 'init':
      initialState.checkPercent = 0
      initialState.uploadPercent = 0
      return { ...initialState }
    default:
      return { checkPercent: state.checkPercent, uploadPercent: state.uploadPercent }
  }
}

const Upload = () => {
  const inputRef = useRef(null)
  const [state, dispatch] = useReducer(reducer, initialState)
  const [chunkSize] = useState(5 * 1024 * 1024)

  /**
   * 将文件转换成md5并进行切片
   * @returns md5
   */
  const md5File = (file) => {
    return new Promise((resolve, reject) => {
      // 文件截取
      let blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice,
        chunkSize = file?.size / 100,
        chunks = 100,
        currentChunk = 0,
        spark = new SparkMD5.ArrayBuffer(),
        fileReader = new FileReader();

      fileReader.onload = function (e) {
        console.log('read chunk nr', currentChunk + 1, 'of', chunks);
        spark.append(e.target.result);
        currentChunk += 1;

        if (currentChunk < chunks) {
          loadNext();
        } else {
          let result = spark.end()
          resolve(result)
        }
      };

      fileReader.onerror = function () {
        message.error('文件读取错误')
      };

      const loadNext = () => {
        const start = currentChunk * chunkSize,
          end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;

        // 文件切片
        fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
        // 检查进度条
        dispatch({ type: 'check', checkPercent: currentChunk + 1 })
      }

      loadNext();
    })
  }

  /**
   * 校验文件
   * @param {*} fileName 文件名
   * @param {*} fileMd5Value md5文件
   * @returns 
   */
  const checkFileMD5 = (fileName, fileMd5Value) => {
    let url = BaseUrl + '/check/file?fileName=' + fileName + "&fileMd5Value=" + fileMd5Value
    return axios.get(url)
  }

  // 上传chunk
  function upload(i, file, fileMd5Value, chunks) {
    //构造一个表单，FormData是HTML5新增的
    let end = (i + 1) * chunkSize >= file.size ? file.size : (i + 1) * chunkSize
    let form = new FormData()
    form.append("data", file.slice(i * chunkSize, end)) //file对象的slice方法用于切出文件的一部分
    form.append("total", chunks) //总片数
    form.append("index", i) //当前是第几片     
    form.append("fileMd5Value", fileMd5Value)
    return axios({
      method: 'post',
      url: BaseUrl + "/upload",
      data: form
    });
  }

  /**
   * 上传chunk
   * @param {*} fileMd5Value 
   * @param {*} chunkList 
   */
  async function checkAndUploadChunk(file, fileMd5Value, chunkList) {
    let chunks = Math.ceil(file.size / chunkSize)
    let hasUploaded = chunkList.length
    for (let i = 0; i < chunks; i++) {
      let exit = chunkList.indexOf(i + "") > -1
      // 如果不存在, 上传
      if (!exit) {
        await upload(i, file, fileMd5Value, chunks)
        hasUploaded++
        let radio = Math.floor((hasUploaded / chunks) * 100)
        dispatch({ type: 'upload', uploadPercent: radio })
      }
    }
  }

  const responseChange = async (file) => {
    // 1.校验文件，返回md5
    const fileMd5Value = await md5File(file)
    // 2.校验文件的md5
    const { data } = await checkFileMD5(file.name, fileMd5Value)
    // 如果文件已存在, 就秒传
    if (data?.file) {
      message.success('文件已秒传')
      return
    }
    // 3：检查并上传切片
    await checkAndUploadChunk(file, fileMd5Value, data.chunkList)
    // 4：通知服务器所有服务器分片已经上传完成
    notifyServer(file, fileMd5Value)
  }

  /**
   * 所有的分片上传完成，准备合成
   * @param {*} file 
   * @param {*} fileMd5Value 
   */
  function notifyServer(file, fileMd5Value) {
    let url = BaseUrl + '/merge?md5=' + fileMd5Value + "&fileName=" + file.name + "&size=" + file.size
    axios.get(url).then(({ data }) => {
      if (data.stat) {
        message.success('上传成功')
      } else {
        message.error('上传失败')
      }
    })
  }

  useEffect(() => {
    const changeFile = ({ target }) => {
      dispatch({ type: 'init' })
      const file = target.files[0]
      responseChange(file)
    }

    document.addEventListener("change", changeFile)

    return () => {
      document.removeEventListener("change", changeFile)
    }
  }, [])

  return (
    <div className="wrap">
      <div className="upload">
        <span>点击上传文件：</span>
        <input ref={inputRef} type="file" id="file" />
        <Button type="primary" onClick={() => inputRef.current.click()}>上传</Button>
      </div>
      {state.checkPercent > 0 && (
        <SlideDown className={'my-dropdown-slidedown'} >
          <div className="uploading">
            <div>校验文件进度：<Progress style={{ width: 200 }} percent={state.checkPercent} /></div>
          </div>
        </SlideDown>
      )}
      {state.uploadPercent > 0 && (
        <SlideDown className={'my-dropdown-slidedown'} >
          <div className="uploading">
            上传文件进度：<Progress type="circle" percent={state.uploadPercent} />
          </div>
        </SlideDown>
      )}
    </div >
  )
}

export default Upload
