# wet

`wet` 名称来缩写于 `WEb Template`。

`wet` 是一个基于 ES6 的简易服务器端 WEB 模板引擎，完全没有第三方依赖。

[TOC]

## 安装

Github: https://github.com/hyjiacan/wet

Gitee: https://gitee.com/hyjiacan/wet

npm: https://www.npmjs.com/package/@hyjiacan/wet

```shell
npm i @hyjiacan/wet
```

## 模板用法

`wet` 模板基于 html 语法，模板语言也与常用的 js 写法一致。

_demo.html_

```html
<div>
  <ul>
    <t-for on="item of list">
      <li>{{item}}</li>
    </t-for>
    <t-for on="item in set">
      <li>
        {{item.key}}: {{item.value}}
        <t-with xx="item.value.x.y">
          <span>{{xx.z}}</span>
        </t-with>
      </li>
    </t-for>
  </ul>
  <t-if on="visible">
    condition is true
  </t-if>
  <t-else>
    condition is false
  </t-else>
  <t-tree on="treeData as item">
    <div>
      {{item.data}}
      <div>
      	<t-children />    
      </div>
    </div>
  </t-tree>
  <t-include file="../common/footer.html" />
</div>
```

```javascript
const context = {
  list: [1, 2, 3],
  set: {
    a: 1,
    b: {
      x: {
        y: {z: 5}
      }
    },
    c: 3
  },
  visible: false
}
wet.render('/path/to/demo.html', context, {
  cache: true,
  debug: true
})
```

通过调用 `wet.render(template, context, options?)` 执行模板的渲染，此函数会返回渲染后的HTML字符串。

- `template` 模板文件，可以是相对路径或绝对路径
- `context` 模板的上下文，为模板渲染提供数据。必须是对象，不能是数组
- `options` 可选的选项
    - `cache`，用于指示是否缓存模板文件。注：此缓存指缓存模板文件的DOM结构，并不是渲染结果
    - `debug`，指示是否启用调用模式，在调试模式时，输出的html中会包含模板标签结构。

### `t-for`

此标签用于遍历数据集。

 `for..of` 遍历数组

 ```html
<t-for on="item of array" step="1">
<span>{{item}}</span>
</t-for>
 ```

 `step` 是步长，默认为 `1`

 也可以写作

 ```html
<t-for on="item, index of array">
<span>{{index}}: {{item}}</span>
</t-for>
 ```

`index` 为数组的索引，从 `0` 开始

另外， `for...of` 也可以直接根据指定数值进行循环

 ```html
<t-for on="item of 10">
<span>{{item}}</span>
</t-for>
 ```
 或
 ```html
<t-for on="item of 1-10">
<span>{{item}}</span>
</t-for>
 ```

`1-10` 表示从 1 到 10，当起始位置为 0 时 `0-10` ，可以省略为：`10`。
`-` 两侧不能有空白。仅支持整数。

范围始终包含边界值，如：

- `1-10`: 1, 2, ..., 9, 10
- `0-10`: 0, 1, ..., 9, 10
- `10`: 0, 1, ..., 9, 10
- `9`: 0, 1, ..., 9

> `array` 暂不支持数组字面量


`for..in` 遍历集合

 ```html
<t-for on="item in object">
<span>{{item.key}}: {{item.value}}</span>
</t-for>
 ```

 也可以写作

 ```html
<t-for on="value, key in object">
<span>{{item.key}}: {{item.value}}</span>
</t-for>
 ```

> `object` 暂不支持对象字面量

### `t-if`

条件分支: `<t-if on="condition">`，`condition` 应该是一个条件表达式

### `t-elif`

条件分支 `<t-elif on="condition">`，`condition` 应该是一个条件表达式

### `t-else`

其它条件分支: `<t-else>`

### `t-with`

设置作用域。

```html
<t-with varName="a.b.c">
  {{varName}}
</t-with>
```

在此范围内，`varName` 等于 `a.b.c` 的值，`varName` 应该是一个合法的标识符。

可以声明多个属性：

```html
<t-with varName1="a.b.c" varName2="a.b.c + 5" varNamen="a.b.c * 2">
```

> 此标签一般用于简写层次比较深的对象引用，或者重用某个数据的计算结果

### `t-tree` / `t-children`

渲染树结构

```html
<t-tree on="tree as item">
  <div>{{item.title}}</div>
  <div>{{item.description}}</div>
  <div>
    <t-children />
  </div>
</t-tree>
```

- `tree` 是上下文中的树结构变量，其应该是一个数组(`array`, 以支持多个根结点) 
- `item` 是每个节点在此作用域内的变量名称

另外还有一个配合使用的标签 `<t-children field="children" />`，此标签标记子节点应该渲染的位置

其 `field` 属性指定了子元素的字段名称，默认值为 `children`，即当字段名称为 `children` 时，属性 `field` 可省略。
`t-children` 的子元素会被直接丢弃。

### `t-html`

提供直接渲染HTML的方法，当不使用此标签时，表达式的输出会被转义。

例：

`<t-html>{{'<p></p>'}}</t-html>`，输出 `<p></p>`。

而在不使用 `t-html` 时: `{{'<p></p>'}}`，输出 `&lt;p&gt;&lt;/p&gt;`

### `t-include`

包含功能支持 `<t-include file="./another.html" />`

其属性 `file` 是一个相对文件路径，相对于当前文件的目录。

在 `t-include` 下，只允许出现 `t-fill` 作为其子项。

组合使用 `t-include/t-fill/t-hole` 可以实现布局模板的功能。

### `t-hole`/`t-fill`

`t-hole` 在模板文件中预留 hole，以在模板文件被 `include` 时进行填充。

_a.html_
```html
<div>
    <t-hole name="title">
      <div>默认内容</div>
    </t-hole>
    <t-hole></t-hole>
</div>
```

在上面的模板文件中，定义了两个 `hole`。一个具名的 `title`: `<t-hole name="title">`，另一个是匿名的: `<t-hole>`

不论是具名还是匿名，相同名称只能声明一次。

_b.html_
```html
<t-include file="a.html">
  <t-fill>填充匿名 hole</t-fill>
  <t-fill name="title">填充具名 hole: title</t-fill>
</t-include>
```

不论是具名还是匿名，相同名称只能填充一次。

### `{{}}`

表达式支持: `{{var}}`, `{{obj.prop.value}}`, `{{a - b}}

如果想要原样输出`{{/}}`符号，那么写作 `{!{/}!}`，此时不会被解析，: `{{/}}`。

## 开发计划

暂无
