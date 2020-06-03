# jst

`jst` 是一个基于 ES6 的简易 WEB 模板引擎，完全没有第三方依赖。

## Features

### `t-for`

执行 `for..of`(遍历数组) 和 `for..in`(遍历集合): `<t-for on="item of list">`，`item` 应该是一个合法的标识符

### `t-if`

条件: `<t-if on="condition">`，`condition` 应该是一个条件表达式

### `t-else`

条件: `<t-else>`

### `t-elif`

条件 `<t-elif on="condition">`，`condition` 应该是一个条件表达式

### `t-with`

设置作用域 `<t-with varName="a.b.c">`，在此范围内，`varName` 等于 `a.b.c` 的值，`varName` 应该是一个合法的标识符

### `t-tree`

树结构 `<t-tree on="tree as item">`:

- `tree` 是上下文中的树结构变量，其应该是一个数组(`array`, 以支持多个根结点) 
- `item` 是每个节点在此作用域内的变量名称

其中，`children` 是默认值，即 `children of` 在子节点的字段名称为 `children` 时可以简写为 `<t-tree item="tree">`

另外还有一个配合使用的标签 `<t-children field="children" />`

其 `field` 属性指定了子元素的字段名称，默认值为 `children`，即当字段名称为 `children` 时，属性 `field` 可省略

此标签标记子节点应该渲染的位置

### `{{}}`

表达式支持: `{{var}}`, `{{obj.prop.value}}`, `{{a - b}}`

> 除表达式以外，其它特性暂不支持在 `style` 和 `script` 内容中使用

## Sample

*demo.html*

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
jst.render('demo.index', context, {cache: true})
```

`context` 必须是对象，不能是数组

## TODO

- [ ] 添加 `t-tree` 支持，以渲染树形结构
- [ ] 模板的错误信息输出(文件名，行号，错误信息)
