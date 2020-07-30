# wet

`wet`: Short from `WEb Template`

`wet` is a simple server-end WEB template engine based on ES6, with no 3rd-part dependency.

## Features

### `t-for`

Iterate array(`for..of`) and set(`for..in`): 
`<t-for on="item of list" step="1">`,
`item` should be a valid identical symbol;
`step` is a number to specify the step-length (takes effect on the array iterating only), default: `1`

Also:

```html
<t-for on="value, key in obj" />
<t-for on="item, index of arr" />
<t-for on="item, index of 1-10" />
```

When iterating an array：

`1-10` means iterating from 1 to 10. `0-10` can be `10`. 
Cannot put any whitespace besides `-`. FYI, integer supported only.

The boundary always included:

- `1-10`: 1, 2, ..., 9, 10
- `0-10`: 0, 1, ..., 9, 10
- `10`: 0, 1, ..., 9, 10
- `9`: 0, 1, ..., 9

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

### `t-html`

Provide a method to render with the raw html: `<t-html>{{'{{exp}}<p></p>{{exp}}'}}</t-html>`.

### `t-include`

Provide include supported for another template file: `<t-include file="./another.html" />`

Attribute `file` specify where the template located, And should be a relative path (based on current template file path)

`t-include` can only contain `t-fill` as child

### `t-hole`/`t-fill`

`t-hole` leave a hole in the template file, to fill it when another file includes it.

_a.html_
```html
<div>
    <t-hole name="title">
      <div>default content</div>
    </t-hole>
    <t-hole></t-hole>
</div>
```

In the template file above, we got two holes. 
One with a name `title`:`<t-hole name="title">`，and another without a name: `<t-hole>`

No matter it has a name or not, hole name must be unique.

_b.html_
```html
<t-include file="a.html">
  <t-fill>Fill anonymous hole</t-fill>
  <t-fill name="title">Fill named hole: title</t-fill>
</t-include>
```

No matter it has a name or not, fill name must be unique.

### `{{}}`

Expression: `{{var}}`, `{{obj.prop.value}}`, `{{a - b}}`

The form `{!{/}!}` makes the raw `{{/}}` output: `{{/}}`.

## Sample

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
wet.render('./demo.html', context, {cache: true})
```

`context` must be a `Object`, must not be an `Array`
