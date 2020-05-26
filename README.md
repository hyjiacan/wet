# jst

`jst` 是一个基于 ES6 的简易 WEB 模板引擎，完全没有第三方依赖。

## Features

- `t-for` 执行 `for..of`(遍历数组) 和 `for..in`(遍历集合): `<t-for on="item of list">`
- `t-if` 条件: `<t-if on="condition">`
- `t-else` 条件: `<t-else>`
- `t-elif` 条件 `<t-elif on="condition">`
- `{{}}` 表达式支持: `{{var}}`, `{{obj.prop.value}}`, `{{a - b}}`

## Sample

*demo.html*

```html
<div>
  <ul>
    <t-for on="item of list">
      <li>{{item}}</li>
    </t-for>
    <t-for on="item in set">
      <li>{{item.key}}: {{item.value}}</li>
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
    b: 2,
    c: 3
  },
  visible: false
}
jst.render('demo.index', context)
```

## TODO

- [ ] 模板的错误信息输出(文件名，行号，错误信息)
