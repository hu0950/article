## 深入理解CSS中继承规则

### 什么是CSS样式继承
CSS的继承是指被**包在内部的标签将拥有外部标签的样式性质**。
继承是一种机制，它允许样式**不仅可以应用于某个特定的元素，还可以应用于它的后代**。

### CSS样式规律总结
![image](https://raw.githubusercontent.com/hu0950/material-management/master/inherit.png)
```html
<div id="a" class="a">
    <div id="b" class="b bb">
        <p id="c" class="c">I’am here</p>
    </div>
</html>
- 多个规则没有直接作用于p元素上，需要继承祖先节点的样式
```

1. 没有多个规则，同时作用于离当前元素最近的祖先节点`<div id="b" class="b">`上，此时`<p>`**继承离当前元素最近的祖先元素**的规则，即使更远的祖父节点div#a的权重更高
```CSS
div#a {font-size:12px; color: yellow}
#b {font-size:12px; color: red}
```
result -> color: red

2. 有多个规则，作用于离当前元素最近的祖先节点<div id="b" class="b"> 上，**权重大**的优先
```CSS
div#a {font-size:12px; color: yellow}
div#a div#b {font-size:12px; color: yellow}
#b {font-size:12px; color: red}
```
result -> color: yellow

3. 有多个规则，作用于离当前元素最近的祖先节点`<div id="b" class="b">`上，**权重相同，后者优先**
```CSS
div#a {font-size:12px; color: yellow}
div#a .b {font-size:12px; color: yellow}
div#a .bb {font-size:12px; color: red}
```
result -> color: red

### 继承属性&非继承属性
- 非继承属性: 盒子模型类、背景属性、轮廓样式属性等
- 继承属性：文本属性
- inherit 关键字允许显式的声明继承性，它对继承和非继承属性都生效
- 由于有默认值：a 标签的字体颜色不能被继承；<h1>-<h6>标签字体的大下也是不能被继承的
- （总结）关于哪些属性是可继承的？
关于文字样式的属性，都具有继承性。这些属性包括：color、 text-开头的、line-开头的、font-开头的。
关于盒子、定位、布局的属性，都不能继承。

### 继承容易出现的错误
在实践中，具有继承性的样式，选择器尽量选择比较精确，可以避免类似，直接定义如下样式：html{color: red}，导致后续需要另外的措施来覆盖此类样式

### 层叠性
当对不同的选择器，对一个标签的同一个样式，有不同的值时，有严格处理冲突的机制
最直接原则 > 权重 > 就近原则(样式书写顺序靠后会覆盖)
em 属性

参考文档：https://www.cnblogs.com/Renyi-Fan/p/9225805.html


是否有多个规则同时作用于离当前元素最近的祖父节点