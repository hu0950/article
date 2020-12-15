# Axios系列之如何实现拦截器

### 1. 怎样的场景中使用拦截器？
在我们希望能在请求发送之前，和响应之后，做一些统一的额外逻辑的处理。
   
### 2. 如何使用？
在实际场景中，我们一般会这样来使用拦截器：
- 添加一个请求拦截器:
  请求拦截器, 可以在请求发送之前，做一些事情，但注意，resolve方法中，要return config，这样才能保证下一个拦截器，正常执行。
  
```typescript
axios.interceptors.request.use(function (config) {
  // ...处理config相关逻辑...
  return config;
}, function (error) {
  // 处理请求错误
  return Promise.reject(error);
});
```

- 添加一个响应拦截器：
  响应拦截器, 可以在发送请求之后，对response进行相关的处理，但注意，resolve方法中，要return response。

```typescript
axios.interceptors.response.use(function (response) {
  // 处理响应数据相关逻辑...
  return response;
}, function (error) {
  // 处理响应错误
  return Promise.reject(error);
});
```
- 删除一个请求拦截器：
```typescript
  const deleteInterceptor = axios.interceptors.request.use(function () {/*...*/})
  axios.interceptors.request.eject(deleteInterceptor)
```

以上，只是列举了拦截器的基本使用方法。
   
在深入理解拦截器的实现过程之前，先来了解拦截器与正常请求的整个工作流程：

TODO:(图)

从整体的流程来看，

  - request和response**支持添加多个拦截器**，且它们的**执行是有顺序**的：对于request拦截器，**后添加**的拦截器会在**请求前**的过程中**先执行**；而对于response拦截器，**先添加**的拦截器会在**响应后**的过程中**先执行**
  - 整个过程是一个链式调用的过程，并且**每个拦截器**都可以**支持同步和异步处理**
  - 在链式调用的过程中，请求拦截器 `resolve` 函数处理的是 `config` 对象，而相应拦截器 `resolve` 函数处理的是 `response` 对象。

接下来，我们将带着以下问题，看看 `Axios` 是如何实现以上功能的。
  - 请求和响应拦截器的执行顺序是怎样的？axios的底层又是如何实现以这种顺序执行的？
  - 为什么通过这样的方式添加拦截器，就可以链式处理呢？整个过程是如何实现链式调用的？

### 3. Axios是如何实现拦截器的？
#### （1）创建InterceptorManager类
从拦截器的使用方法上来看，axios对象上需要提供一个interceptor对象，该对象上既有request和response两个属性，它们都有use和eject法，供外部进行添加和删除拦截器，另外，内部还需要一个forEach方法，提供遍历拦截器的功能。

据此，我们可以把use、eject和forEach方法，定义一个单独的类中，即`InterceptorManager` 类统一管理，并在内部维护一个私有属性 `interceptors` ，用来维护拦截器的集合。

```typescript
export default class InterceptorManager<T> {
  // interceptors-拦截器集合（联合类型）
  private interceptors: Array<Interceptor<T> | null>

  constructor() {
    this.interceptors = []
  }

  // 添加
  use(resolved: ResolvedFn<T>, rejected: RejectedFn): number {
    this.interceptors.push({
      resolved,
      rejected
    })
    return this.interceptors.length - 1
  }

  // 删除
  eject(id: number): void {
    if (this.interceptors[id]) {
      this.interceptors[id] = null
    }
  }

  // 内部逻辑，不暴露给外边
  // interceptors是私有变量，外部无法访问，为了可访问这个对象，需要添加这个方法
  /**
   * forEach 会遍历所有的拦截器interceptors，并支持传入函数，在遍历过程中，会调用该函数，并将每个拦截器对象作为该函数的参数传入
   * @param {(interceptor: Interceptor<T>) => void} fn
   */
  forEach(fn: (interceptor: Interceptor<T>) => void): void {
    this.interceptors.forEach(item => {
      if (item !== null) {
        fn(item)
      }
    })
  }
}
```
#### （2）实现拦截器链式调用的核心逻辑
外部是通过axios.interceptors.[request|response][use|eject]方式调用的，因此，axios提供一个interceptors属性，且它的类型Interceptors如下：

```typescript
interface Interceptors {
  request: InterceptorManager<AxiosRequestConfig>
  response: InterceptorManager<AxiosResponse>
}
```
Interceptors类型，还有两个属性，分别是request-请求拦截器实例和response-相应拦截器实例，并在Axios类的构造器constructor中初始化interceptors实例属性，这样，外部实例化Axios类时，就可以得到interceptors属性上的请求拦截器实例和response-相应拦截器实例。

```typescript
export default class Axios {
  interceptors: Interceptors
  defaults: AxiosRequestConfig

  // 实例化InterceptorManager，使用外部在调用Axios.interceptors.request.use()方法，可以添加拦截器
  constructor(initConfig: AxiosRequestConfig) {
    this.defaults = initConfig
    this.interceptors = {
      request: new InterceptorManager<AxiosRequestConfig>(),
      response: new InterceptorManager<AxiosResponse>()
    }
  }

  // Axios类实现请求的核心函数，调用Axios其它请求方法时，都会调用request方法
  request(url: any, config?: any): AxiosPromise {
    if (typeof url === 'string') {
      if (!config) {
        config = {}
      }
      config.url = url
    } else {
      config = url
    }

    config = mergeConfig(this.defaults, config)

    // 初始值, 先将请求放入chain中，如果没有请求拦截器，保证可以最先执行正常的请求
    const chain: PromiseChain[] = [
      {
        resolved: dispatchRequest,
        rejected: undefined
      }
    ]
    
    // 如：request拦截器[1,2,3] -> 经过forEach方法 -> chain: [3,2,1,请求]
    this.interceptors.request.forEach(interceptor => {
      chain.unshift(interceptor)
    })

    // 如：response拦截器[4,5,6] -> 经过forEach方法 -> chain: [3，2，1，请求，4，5，6]
    this.interceptors.response.forEach(interceptor => {
      chain.push(interceptor)
    })

    let promise = Promise.resolve(config) // 初始值->给chain第一个执行的fn传入config

    while (chain.length) {
      // chain有确定值，即在没有拦截器的情况下，至少会有拦截器，不会为空
      const { resolved, rejected } = chain.shift()!
      // 每个request的拦截器在使用config进行相关逻辑的处理后，需要返回config，作为下个拦截器的resolve函数的参数，否则接下来的拦截器链式调用将会失效
      // resolved函数的res，是上一个函数的return值，因此，response第一个的promise resolve函数的res是dispatchRequest的return的response的值
      promise = promise.then(resolved, rejected)
    }
    return promise
  }
  // ...
}
```
在request方法中，首先，定义PromiseChain类型的chain，用于保存请求和响应拦截器，以及正常的请求，同时，并将基本的正常请求dispatchRequest赋值给resolved属性，以此，在保证在没有拦截器的情况下，正常请求可以正常执行。

  接下来，来看一下，chain中拦截器与正常请求的顺序是怎样的？

```typescript
  // 如：request拦截器[1,2,3] -> 经过forEach方法 -> chain: [3,2,1,请求]
    this.interceptors.request.forEach(interceptor => {
      chain.unshift(interceptor)
    })

    // 如：response拦截器[4,5,6] -> 经过forEach方法 -> chain: [3，2，1，请求，4，5，6]
    this.interceptors.response.forEach(interceptor => {
      chain.push(interceptor)
    })
```
this.interceptors[request|response]实例化的InterceptorManager类中，都各自维护一个私有属性interceptors，用于保存各自的拦截器。在request中，通过调用了forEach方法，遍历私有的interceptors。请求拦截器的unshirt方法会逐一插入到chain中的前面，即如果在定义请求拦截器时，是以[1,2,3]的顺序use的，则经过forEach插入到chain中的顺序应该是：[3,2,1,正常请求]；而响应拦截器则是通过push的方法，逐一插入到chain中的后面，即如果在定义响应拦截器时，是以[4,5,6]的顺序use的，则经过forEach插入到chain中的顺序应该是[3,2,1,正常请求,4,5,6]。

最后，再来看下，是如何实现链式调用的？
实现链式调用的核心，是采用promise来实现链式调用的，代码实现如下：

```typescript
let promise = Promise.resolve(config)

while (chain.length) {
  const { resolved, rejected } = chain.shift()!
  promise = promise.then(resolved, rejected)
}
```
先定义一个已经resolve的promise，遍历chain，取出每个拦截器对象的resolved和rejected方法，传入promise.then方法的参数中，这样，就相当于通过promise的方式实现了拦截器可逐层进行链式调用的功能。

之前提到，为什么请求拦截器中resolved方法中，参数是config，而必须要返回config，原因是下一个拦截器resolved函数中的res，是上一个resolved函数的，这样才能保证在处理完请求拦截器后，处理正常请求时，传入给dispatchRequest方法的是config，而返回的是response。如果之后再有响应拦截器，则传入resolved函数的参数是response，同理，在处理完每个相应拦截器的逻辑之后，应返回response，供下一个拦截器进行使用。