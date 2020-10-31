## Axios系列之拦截器

### 拦截器可以用来做什么？
在我们希望能在请求发送之前，和响应之后，做一些统一的额外逻辑的处理。

### 如何使用？
在实际场景中，我们一般会这样来使用拦截器：
- 添加一个请求拦截器：

```javascript
axios.interceptors.request.use(function (config) {
  // ...处理config相关逻辑...
  return config;
}, function (error) {
  // 处理请求错误
  return Promise.reject(error);
});
```
所添加的请求拦截器，可以在请求发送之前，通过拦截器的resolve函数处理config对象。但注意，resolve函数中，要return config，这样才能保证下一个拦截器的resolve函数，可以正常处理config对象。

- 添加一个响应拦截器：

```javascript
axios.interceptors.response.use(function (response) {
  // 处理响应数据相关逻辑...
  return response;
}, function (error) {
  // 处理响应错误
  return Promise.reject(error);
});
```
所添加的响应拦截器, 可以在发送请求之后，通过拦截器的resolve函数，对response进行相关的处理。但注意，resolve方法中，要return response，这样才能保证下一个拦截器的resolve函数，可正常的处理response对象。

- 删除一个请求拦截器：

```javaScript
  const deleteInterceptor = axios.interceptors.request.use(function () {/*...*/})
  axios.interceptors.request.eject(deleteInterceptor)
```

以上，只是列举了拦截器的基本使用方法。
   
在深入理解拦截器的实现原理之前，先来了解拦截器与正常请求的整体工作流程：

TODO:(整体工作流程图)

从整体的流程来看，

  - request和response**支持添加多个拦截器**，且它们的**执行是有顺序**的：对于request拦截器，在**请求前**的过程中**后添加**的拦截器会**先执行**；而对于response拦截器，在**响应后**的过程中**先添加**的拦截器会**先执行**
  - 整个过程是一个链式调用的过程，并且**每个拦截器**都可以**支持同步和异步处理**
  - 在链式调用的过程中，请求拦截器 `resolve` 函数处理的是 `config` 对象，而响应拦截器 `resolve` 函数处理的是 `response` 对象。

### 如何实现？

> 先从使用层面的角度来解释， `Axios` 是怎么做到可以分别添加、删除多个请求拦截器和响应拦截器的？再接着深入分析整个过程是如何实现链式调用的？以及`Axios`是添加的多个拦截器，有着怎样的执行顺序？

1. 首先，可以看到Axios构造函数提供了一个interceptor对象，该对象上有request和response两个属性，分别是请求拦截器管理实例和相应拦截器管理实例。这样，外部通过调用
`interceptors.[request|response]`，就可调用相应的拦截器方法。

```javaScript
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}
```

2. InterceptorManager具体做了什么工作？
   
  `InterceptorManager` 可以看成是统一管理拦截器对象。在内部维护了`handlers`，
用来存储拦截器。在 `InterceptorManager` 的原型上，还提供了 `use` 、 `eject` 和 `forEach` 3个方法，分别用于添加、删除和遍历拦截器。

```javaScript
function InterceptorManager() {
  this.handlers = [];
}

// 添加拦截器
InterceptorManager.prototype.use = function use(fulfilled, rejected) {
  this.handlers.push({
    // 成功回调
    fulfilled: fulfilled,
    // 失败回调
    rejected: rejected
  });
  // 返回一个ID，用来标记拦截器，以便于删除
  return this.handlers.length - 1;
};

// 删除拦截器
InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

// 遍历拦截器（内部逻辑，不暴露给外部用户使用）
InterceptorManager.prototype.forEach = function forEach(fn) {
  // 这里的形参h，是拦截器集合handlers的每个拦截器对象，有属性fulfilled和rejected，它是外部通过调用use方法添加拦截器时传入的
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};
```
- use的主要功能是：添加拦截器到handlers，并返回一个id，用于删除。该方法支持两个参数，第一个参数类似Promise的resolve函数，第二个参数类似Promise的reject函数。用户可以自定义传入同步代码和异步代码逻辑即可。

- eject的功能不用多说，是根据之前添加后返回的id，用来删除拦截器的。

- forEach的主要功能是：遍历所有的拦截器handlers，并支持传入函数，在遍历过程中，会调用该函数，并将每个拦截器对象作为该函数的参数传入.

3. 链式调用是如何实现的？
  
  下面来看一个实际请求发生时，核心的逻辑方法request：
   
```javaScript
Axios.prototype.request = function request(config) {
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof config === 'string') {
    config = arguments[1] || {};
    config.url = arguments[0];
  } else {
    config = config || {};
  }

  config = mergeConfig(this.defaults, config);

  // Set config.method
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }

  // 初始值, 先将请求放入chain中，如果没有请求拦截器，保证实际请求可以正常发送
  var chain = [dispatchRequest, undefined];
  // 给chain中第一个执行的fn传入config
  var promise = Promise.resolve(config);

  // 将请求拦截器按添加时顺序的倒序，存储到chain中
  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

 // 将响应拦截器按添加的顺序的正序，存储到chain中
  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  // 开始执行整个请求流程（请求拦截器->dispatchRequest->响应拦截器）
  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
};
```
回忆以上所提到的，添加拦截器时，都会传入成功回调 `fulfilled` ，和失败回调`rejected`

在 `request` 方法中，首先，构造了一个关键数组变量chain，该值的初始值是：`[dispatchRequest, undefined]`，即相当于dispatchRequest是fulfilled属性，
undefined是rejected，如果没有请求拦截器，保证实际请求可以正常发送。

接着，通过`Promise.resolve(config)`，定义一个已经resolve的promise。

通过分别调用请求和响应拦截器管理对象的`foreach`方法，分别遍历之前通过`use`方法所添加的拦截器，并取每个拦截器`fulfilled`和`rejected`依次加入到chain中，数组中的每项都是待执行的函数。

需要注意的是：请求拦截器是使用`unshift`加入到chain中的，这也就解释了之前所提到的，**对于请求拦截器，先执行后添加的，再执行先添加的**。举个例子：新增request拦截器[1,2]，经过forEach方法，得到的chain是：[request拦截2success, request拦截器2error, request拦截器1success, request拦截器1error, 实际请求success, 实际请求error]。

而响应拦截器是`push`加入到chain中的，这就是**对于响应拦截器，先执行先添加的，后执行后添加的。** 的原因。在之前例子的基础上，再新增了response拦截器[3, 4]，经过forEach方法，得到的chain是：[request拦截2success, request拦截器2error, request拦截器1success, request拦截器1error, 实际请求success, 实际请求error, response拦截器3success, response拦截器3error, response拦截器4success, response拦截器4error]

最后，实现链式调用最关键的一步：
```javaScript
while (chain.length) {
  promise = promise.then(chain.shift(), chain.shift());
}
```
经过上一步，`chain` 中已经存储了请求拦截器、正常请求以及响应拦截器，接下来，就要遍历这个 `chain` ，取到每个拦截器所传入的成功回调函数 `fulfilled` 和失败回调函数 `rejected` ，并添加到 `promise.then` 的参数中，这也就做到了通过Promise链式调用的方式，实现逐一调用多个拦截器的效果。

也正是由于是采用Promise链式调用的方式实现的，且在初始时定义了`Promise.resolve(config)`，因此，链式调用的过程中，**请求拦截器 `resolve` 函数处理的是 `config` 对象**，每个request的拦截器，在对config进行相关逻辑的处理后，需要return config，作为下个拦截器resolve函数的参数，否则接下来的拦截器链式调用将会失败。此外，response拦截器中的第一个promise resolve函数的参数是实际请求`dispatchRequest`处理完成之后`return`的`response`的值，因此，**响应拦截器 `resolve` 函数处理的是 `response` 对象**。


<!-- TODO： resolve 和 rejected的校验-->





