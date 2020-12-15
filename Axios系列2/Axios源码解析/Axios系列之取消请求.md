## Axios系列之如何实现取消请求

### 1. 使用场景
（TODO：补充主动取消请求的场景）
提供可主动取消已发送但未响应的请求。比如，在发请求时，如果前面的请求还没有响应，可以有方法把前面的请求取消。

### 2. 如何使用
方法1：
```javascript
const CancelToken = axios.CancelToken;
let cancel;

axios.get('/cancel/get', {
  cancelToken: new CancelToken(function executor(c) {
    cancel = c;
  })
}).catch(function(e) {
  if (axios.isCancel(e)) {
    console.log('Request canceled:', e.message)
  }
})

// 取消请求
setTimeout(() => {
  cancel('Cancel Request message');
}, 200)

```
`axios.CancelToken` 是一个封装了取消请求相关操作的构造函数，方法1是将`axios.CancelToken`的实例化对象，传给请求的配置项 `cancelToken` 。这个构造函数的参数支持传入一个 `executor` 方法，该方法的参数是一个取消函数 `c` ，将函数 `c` 赋值给我们在外部使用中定义的 `cancel`，此后，在想要主动取消请求的时机，就可以通过该调用该方法取消请求。

方法2：
```javascript
const CancelToken = axios.CancelToken
const source = CancelToken.source()

axios.get('/cancel/get', {
  cancelToken: source.token
}).catch(function(e) {
  if (axios.isCancel(e)) {
    console.log('Request canceled:', e.message)
  }
})
// 取消请求 (请求原因是可选的)
setTimeout(() => {
  source.cancel('Cancel Request message');
}, 200)
```
`axios` 暴露了一个 CancelToken 的对象，调用该对象的 `source` 方法后，可会返回一个 `source` 对象，
需要在每次请求时，都要将 `source.token` 传给配置对象的`cancelToken` 属性，然后再发请求时，通过调用 `source.cancel` 方法取消本次请求。

### 3. 如何实现
首先，入口层面，axios.js 暴露了静态方法Cancel、CancelToken以及isCancel，供用户调用。

```javascript
axios.Cancel = require('./cancel/Cancel');
axios.CancelToken = require('./cancel/CancelToken');
axios.isCancel = require('./cancel/isCancel');
```
通过1）和2）两点的解析，将会知晓取消请求的核心逻辑设计，以及很清楚地可以知道，为什么通过以上章节2中调用的方式，就可以成功的取消一个请求。

**1）CancelToken 核心逻辑** 

/cancel/CancelToken.js（实现请求取消的核心逻辑）：

```javaScript
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

  var resolvePromise;
  // 实例化一个pedding状态的Promise对象
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });

  var token = this;

  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      return;
    }
    // 此时的token.reason是一个Cancel对象 { message: message }
    token.reason = new Cancel(message);
    resolvePromise(token.reason);
  });
}

// CancelToken提供静态方法source
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};
```

在构造函数 `CancelToken` 的内部，有一个关键的变量 `promise` ，用来保存实例化一个 `pedding` 状态的 `Promise` 对象，同时，还将 `resolve` 函数赋值给 `resolvePromise` 。接着，在外部调用 `executor` 函数传入的cancel函数，cancel函数的执行，标志用户在外部主动取消请求，在其内部，会调用 `resolvePromise` ，将 `Promise` 对象的状态由 `pedding` 改变为 `resolved`。

另外，`CancelToken` 还提供了一个静态方法 `source` ，该方法其实是简化了用户在外部调用的操作，用户不需要像在方法1中，传给请求配置项 `config` 的 `cancelToken` 属性是一个繁琐的CancelToken实例化对象，如：

```javaScript
cancelToken: new CancelToken(function executor(c) {
  cancel = c;
})
```

在 `source` 方法中，最后返回的是一个对象，拥有两个属性，分别是 `token` （用于存储直接实例化的结果）和 `cancel`（用于保存指向参数  `c` 这个取消函数，外部可以取消请求）

**2）异步分离的设计是如何做到的** 

了解了1）中的关键逻辑后，我们都知道，用户可以在外部自行通过调用取消函数，来取消请求，但请求的发送是一个异步的过程，那在负责请求的核心逻辑`xhr.js`中，又是如何来做到控制请求的取消呢？

这里也是取消请求实现，比较值得我们学习的一个点——**异步分离思想**。

一个请求要能够成功地被发送，它最终会执行 `xhr.send` 方法，而想要取消请求，只需要在执行`xhr.send` 方法前，借助xhr对象的abort方法，就可以把请求取消。

这里的**异步分离是通过 Promise 实现**的，主要的思路是：在 `cancelToken` 中保存一个 `pending` 状态的 `Promise` 对象，当用户在外部调用 `cancel` 方法时，内部能够访问到这个  `Promise` 对象，并把它从 `pending` 状态变成 `resolved` 状态.

与此同时，xhr.js 中会在 `xhr` 异步请求过程中，会插入一段代码：
```javascript
if (config.cancelToken) {
  // Handle cancellation
  // 这里的参数cancel是一个Cancel对象 {message: '调用cancel时，外部传入的reason'}
  config.cancelToken.promise.then(function onCanceled(cancel) {
    if (!request) {
      return;
    }
    request.abort();
    reject(cancel);
    // Clean up request
    request = null;
  });
}
```
这样一来，在`config.cancelToken.promise`的`then`函数中去实现取消请求的逻辑。
当用户在外部执行 `cancel` 函数时候，就会执行以上这部分代码，从而通过执行 `xhr.abort` 方法来取消请求。

**3）报错信息的处理**
在/cancel/CancelToken.js中，关注executor方法中的`token.reason = new Cancel(message);`
```javascript
executor(function cancel(message) {
  if (token.reason) {
    // Cancellation has already been requested
    return;
  }
  // 此时的token.reason是一个Cancel对象 { message: message }
  token.reason = new Cancel(message);
  resolvePromise(token.reason);
});
```
在/cancel/cancel.js中
```javascript
function Cancel(message) {
  this.message = message;
}

Cancel.prototype.toString = function toString() {
  return 'Cancel' + (this.message ? ': ' + this.message : '');
};

Cancel.prototype.__CANCEL__ = true;
```
这里巧妙设计抛出错误的`reason`，并非简单是将在调用cancel时传入的取消请求的message，而是一个Cancel对象，该对象上的原型上还有`__CANCEL__:true`。这样一来，在外部调用请求的catch方法中，就可以依靠调用`axios.isCancel`方法，来区别接收到的错误对象，是源自取消请求抛出的错误，还是一般请求错误抛出的异常。

**4）额外的异常逻辑**
在/cancel/CancelToken.js中，还有一段逻辑：
```javascript
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};
```
主要做的事情是：判断如果存在 `this.reason` ，说明请求携带的 cancelToken 已经被使用过，此时直接将这个`this.reason`抛错，抛出的异常信息中包含着取消的原因。

```javascript
module.exports = function dispatchRequest(config) {

  // 发送请求前，异常抛错检查
  throwIfCancellationRequested(config);

  // ...

  var adapter = config.adapter || defaults.adapter;
  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);
    // ...
    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);
      // ...
    }
    return Promise.reject(reason);
  });
};
```