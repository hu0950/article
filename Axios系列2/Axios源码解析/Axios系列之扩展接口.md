## Axios系列之扩展接口

### 1. 使用场景
Axios 为用户提供基本的API，通过传入相应的参数，就可以发送请求，调用方式如下：
axios(config)
axios(url[, config])

为了简化用户在每次调用时的配置方式，在基本的调用方式上，扩展了一些接口：
```javascript
axios.request(config)
axios.get(url[, config])
axios.delete(url[, config])
axios.head(url[, config])
axios.options(url[, config])
axios.post(url[, data[, config]])
axios.put(url[, data[, config]])
axios.patch(url[, data[, config]])
```

这样一来，当用户在使用以上所提供的这些拓展方法，`url`、 `method`和`data` 这些属性都不需要具体指定了。

### 2. 如何实现
通过外部的使用方法，我们可以发现，这里的axios，不仅仅只是一个可以提供请求的方法，它本身还是一个对象，拥有很多的属性，如：get、post、delete等。

调用每个扩展接口的本质，其实都是在调用request方法，而刚提到axios支持两种传参形式，如`axios(config)`和`axios(url[, config])`，那首先我们需要关注在核心方法request内部，是如何实现的？以及，还会分析为什么直接调用axios和调用axios上的属性方法，就可以正常使用发送请求的功能？

接下来，带着这两个问题，我们看看源码层面是如何来实现的？

**1）通过函数重载思想，实现axios函数可以支持多种传参形式**

在下边的分析中会解释到，为什么直接调用axios函数相当于调用`Axios.prototype.request`方法，这里先分析是怎么运用了函数重载的思想，支持axios调用的两种传参形式。

/lib/core/Axios.js
先来看看核心的`request`方法：
```javascript
Axios.prototype.request = function request(config) {
  /*eslint func-names:0*/
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
在`request`中，定义形参时，只定义了config，但外部传入参数时，可以传一个，也可以传两个。在函数中，首先，判断了传入的第一个参数是否是字符串类型的，如果是字符串，则认为是传两个参数的情况，即使用的是`axios(url[, config])`的调用方式，这种case下，先将传入的第二个参数赋值给config，并认为用户传入的第一个参数是个url，赋值给config的url属性；如果传入的第一个参数不是字符串，即使用的是`axios(config)`的调用方式，直接将传入的配置赋值给config，并做了异常case处理，如果不传，则为一个空对象{}。

**2）如何实现混合对象的**

下面可以看到，`get`、`delete`、`head`、`options`、`post`、`patch`、`put` 这些方法，都挂载在了 `Axios` 的 `prototype` 上，并且，这些方法的**内部都是通过调用以上所分析的`request`方法**，来实现发送请求的。

/lib/core/Axios.js
```javascript
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
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
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, data, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});
```
不同的是，因这些方法的传参形式不同，在做config的merge合并处理也不完全相同，例如：`get`、`delete`、`head`、`options`这类方法，不需要传data，而`post`、`patch`、`put` 这类方法需要传`data`。

lib/axios.js
```javascript
function createInstance(defaultConfig) 
  var context = new Axios(defaultConfig);
  // 使得instance是一个函数
  var instance = bind(Axios.prototype.request, context);

  // 拷贝Axios原型上的方法到instance
  utils.extend(instance, Axios.prototype, context);

  // 拷贝Axios实例方法到instance
  utils.extend(instance, context);

  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;
```

可以看到，这里混合对象的思路大体是：在 `createInstance` 函数的内部，首先实例化 `Axios`，得到一个实例 `context` ，接着声明一个 `instance` 指向 `Axios.prototype.request` 方法，并绑定了上下文，再分别将 `Axios` 原型以及实例上的方法，通过 `extend` 方法，拷贝到 `instance` 上，最后，**createInstance函数返回的instance，就可以本身是一个函数，又能拥有Axios的所有原型方法和实例方法。**

这样一来，接下来就可以通过 `createInstance` 函数创建 `axios`，当外部直接调用 `axios` 方法时，就相当于直接执行 `Axios.prototype.request` 方法，此外，还可以调用 `axios.get` 、`axios.post` 等方法。

【TODO：总结】
### 4. 总结
