# jst

Simple Javascript Template Engine.

Depend on [htmlparser](https://github.com/tautologistics/node-htmlparser)


## Features

- `t-for`
- `t-if`

> Note: `t-else` not supported, use `t-if` instead


## Sample

*demo.html*

```html
<div>
  <ul>
    <t-for loop="item of list">
      <li>{{item}}</li>
    </t-for>
    <t-for loop="item in set">
      <li>{{item.key}}: {{item.value}}</li>
    </t-for>
  </ul>
  <t-if on="visible">
    condition is true
  </t-if>
  <t-if on="!condition">
    condition is false
  </t-if>
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
