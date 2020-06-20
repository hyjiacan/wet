# jst

`jst` is a simple template engine based on ES6, with no 3rd-part dependency.

## Features

### `t-for`

Iterate array(`for..of`) and set(`for..in`): `<t-for on="item of list">`, `item` should be a valid identical symbol

### `t-if`

Condition: `<t-if on="condition">`, `condition` can be a expression or variable

### `t-else`

Condition: `<t-else>`

### `t-elif`

Condition`<t-elif on="condition">`, `condition` can be a expression or variable

### `t-with`

Make a scope `<t-with varName="a.b.c">`, `varName` equals the value of `a.b.c`,  `varName` should be a valid identical symbol

### `t-tree`

Render tree structure `<t-tree on="tree as item">`:

- `tree` is a field of context, should b e an Array (in order to support for multiple root nodes)
- `item` is the variable name in the scope

And you should(must) use `<t-children field="children" />` to specify where to render the children nodes.

### `t-include`

Provide include supported for another template file: `<t-include file="./another.html" />`

Attribute `file` specify where the template located, And should be a relative path (based on current template file path)

### `{{}}`

Expression: `{{var}}`, `{{obj.prop.value}}`, `{{a - b}}`

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
jst.render('./demo.html', context, {cache: true})
```

`context` must be a `Object`, must not be an `Array`