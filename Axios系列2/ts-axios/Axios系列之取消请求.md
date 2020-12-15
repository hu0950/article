# Axios系列之如何实现取消请求

### 1. 使用场景
取消已发送但未响应的请求。（在发请求时，如果前面的请求还没有响应，可以有方法把前面的请求取消。）

### 2. 如何使用？
方法1：
```javascript
const CancelToken = axios.CancelToken;
let cancel;

axios.get('/cancel/get', {
  cancelToken: new CancelToken(function executor(c) {
    cancel = c;
  })
});

// 取消请求
cancel('Cancel Request message');
```

方法2：
```javascript
const CancelToken = axios.CancelToken
const source = CancelToken.source()

axios.get('/cancel/get', {
  cancelToken: source.token
}).catch(function(e) {
  // axios.isCancel(e) 会判断 在 ehr 中throw的error是不是Cancel的实例，如果是，则是取消请求，请求abort后抛出的异常，以此用来鉴别和普通的抛错
  // 此处的e是Cancel的实例化对象
  if (axios.isCancel(e)) {
    console.log('Request canceled', e.message)
  }
})
// 取消请求 (请求原因是可选的)
source.cancel('Cancel Request message');
```

3. 具体实现

请求在config配置中的cancelToken，传入一个实例化的CancelToken类对象，然后在外部调用一个cancel方法。

xhr对象提供了一个abort方法，可以把请求取消。

```typescript
if (cancelToken) {
  cancelToken.promise.then(reason => {
    request.abort()
    // 将请求abort后，request.readyState置为0
    // reason是Cancel对象的实例
    reject(reason)
  })
}
```
取消请求：


异步分离思想：

异常错误信息的处理:

静态方法：

```typescript
import Cancel from './Cancel'

interface ResolvePromise {
  (reason?: Cancel): void
}

export default class CancelToken {
  promise: Promise<Cancel>
  reason?: Cancel

  constructor(executor: CancelExecutor) {
    let resolvePromise: ResolvePromise
    this.promise = new Promise<Cancel>(resolve => {
      resolvePromise = resolve
    })

    executor(message => {
      if (this.reason) {
        return
      }
      this.reason = new Cancel(message)
      resolvePromise(this.reason)
    })
  }
}
```









