## Axios源码解析系列之扩展接口

### 1. 使用场景

Axios 为用户提供基本的API，通过传入相应的参数，就可以发送请求，调用方式如下：
- axios(config)
- axios(url[, config])

为了简化用户在每次调用时的配置方式，在基本的调用方式上，还扩展了一些接口：

```javascript
// 基本的request方法
axios.request(config)
// 参数不含有data
axios.get(url[, config])
axios.delete(url[, config])
axios.head(url[, config])
axios.options(url[, config])
// 参数含有data
axios.post(url[, data[, config]])
axios.put(url[, data[, config]])
axios.patch(url[, data[, config]])
```

这样一来，当用户使用以上这些拓展方法，`url`、 `method` 和 `data` 这些属性都不需要在 `config` 中具体指定了。

### 2. 如何实现

通过外部的使用方法，我们可以发现，这里的 `axios` ，由于不仅可以直接调用，还可以通过 `axios.get`、`axios.post` 等方法来调用，因此，它不仅仅只是一个可以提供请求的方法，它本身还是一个对象，拥有很多的属性，如：`get`、`post`、`delete` 等。

在「使用场景」部分中，也提到过直接调用 `axios` ，支持两种传参形式：`axios(config)` 和 `axios(url[, config])` ，那 `Axios` 是如何支持多种传参形式的？此外，关注其调用每个扩展接口，它和 `request` 方法是什么关系？以及为什么直接调用 `axios` 和调用 `axios` 上的属性方法，都可以正常发送请求？

接下来，带着这三个问题，我们看看源码层面是如何来实现的？

**1）应用函数重载思想，实现支持多种传参形式**

在后边会分析到为什么直接调用 `axios` 函数相当于调用 `Axios.prototype.request` 方法，这里先来解释 `request` 方法是怎么运用函数重载的思想，使得 `axios` 函数可以支持两种传参形式的。

先来看看核心的 `Axios` 原型上的 `request` 方法：

> 源码目录：/lib/core/Axios.js

```javascript
Axios.prototype.request = function request(config) {
  // 函数重载，支持axios(url[, config]) 和axios(config)两种调用方式
  if (typeof config === 'string') {
    config = arguments[1] || {};
    config.url = arguments[0];
  } else {
    config = config || {};
  }
  
  // 合并default配置和传入的config，得到最终的config
  config = mergeConfig(this.defaults, config);

  // 核心请求逻辑...
};
```
函数 `request` 在定义形参时，只定义了 `config` ，但外部传入参数时，可以传一个，也可以传两个。**采用函数重载的思想，通过判断传入的第一个参数类型，执行不同的赋值逻辑：**
- 如果是字符串，则认为是使用的是 `axios(url[, config])` 的调用方式，这种case下，先将传入的第二个参数赋值给config，并认为用户传入的第一个参数是个url，赋值给config的url属性；
- 如果不是字符串，则使用的是`axios(config)`的调用方式，直接将传入的配置赋值给config，并做了异常case处理，如果不传，则为一个空对象{}。

**2）多种请求方式调用的本质**

下面可以看到，`get`、`delete`、`head`、`options`、`post`、`patch`、`put` 这些方法，都挂载在了 `Axios` 的 `prototype` 上，并且，这些**方法的内部都是通过调用 `request` 方法，来实现发送请求的**。

> 源码目录：/lib/core/Axios.js

```javascript
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {

  Axios.prototype[method] = function(url, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: (config || {}).data
    }));
  };
});
```

```javascript
utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {

  Axios.prototype[method] = function(url, data, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});
```

以上两段代码，主要是完成将传入的参数与 `config` 进行 `merge` 操作，但因这些方法的传参形式不同，合并处理也不完全相同，例如：`get`、`delete`、`head`、`options` 这类方法，不需要传 `data` ，而 `post`、`patch`、`put` 这类方法需要传 `data`。

**3）采用混合对象，实现可调用 `axios` 与其的属性方法**

接下来解释上边提出的问题，为什么直接调用 `axios` 和调用 `axios` 上的属性方法，都可以正常发送请求？

先来说说为什么说是采用了混合对象来实现的？在这里，可将 `axios` 当成是一个混合对象，其本身是一个函数，而它同时还是一个对象，其拥有的属性，对应的属性值也是方法。

具体的思想思路大致如下：在 `createInstance` 函数的内部，首先实例化 `Axios`，得到一个实例 `context` ，接着声明一个 `instance` 指向 `Axios.prototype.request` 方法，并绑定了上下文，再分别将 `Axios` 原型以及实例上的方法，而这些方法，就是刚才所提到的 `Axios.prototype.get` 、`Axios.prototype.post` 等方法，通过 `extend` 方法，拷贝到 `instance` 上，最后，**createInstance函数返回的 `instance` ，就可以本身是一个函数，又能拥有Axios的所有原型方法和实例方法。**

> 源码目录：lib/axios.js

```javascript
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  // 使得instance是一个函数
  var instance = bind(Axios.prototype.request, context);

  // 拷贝Axios原型上的方法到instance
  utils.extend(instance, Axios.prototype, context);

  // 拷贝Axios实例方法到instance
  utils.extend(instance, context);

  return instance;
}

var axios = createInstance(defaults);

axios.Axios = Axios;
```

这样一来，接下来就可以通过 `createInstance` 函数创建 `axios`，当外部直接调用 `axios` 方法时，就相当于直接执行 `Axios.prototype.request` 方法，此外，还可以调用 `axios.get` 、`axios.post` 等方法。

