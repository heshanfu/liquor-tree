import Node from '@/lib/Node'
import Selection from '@/lib/Selection'

import find from '@/utils/find'
import objectToNode from '@/utils/objectToNode'
import { List } from '@/utils/stack'
import { TreeParser } from '@/utils/treeParser'
import { recurseDown } from '@/utils/recurse'


export default class Tree {
  constructor(vm) {
    this.vm = vm
    this.options = vm.options

    this.activeElement = null
  }

  $on(name, ...args) {
    this.vm.$on(name, ...args)
  }

  $once(name, ...args) {
    this.vm.$once(name, ...args)
  }

  $off(name, ...args) {
    this.vm.$off(name, ...args)
  }

  $emit(name, ...args) {
    this.vm.$emit(name, ...args)
  }

  selected() {
    return new Selection(this, ...this.selectedNodes)
  }

  checked() {
    if (!this.options.checkbox) {
      return null
    }

    return new Selection(this, ...this.checkedNodes)
  }


  setModel(model) {
    this.model = model

    /**
    * VueJS transform properties to reactives when constructor is running
    * And we lose List object (extended from Array)
    */
    this.selectedNodes = new List
    this.checkedNodes = new List

    recurseDown(model, node => {
      node.tree = this

      if (node.selected()) {
        this.selectedNodes.add(node)
      }

      if (node.checked()) {
        this.checkedNodes.add(node)

        if (node.parent) {
          node.parent.refreshIndeterminateState()
        }
      }
    })

    if (!this.options.multiple && this.selectedNodes.length) {
      let top = this.selectedNodes.top()

      this.selectedNodes.forEach(node => {
        if (top !== node) {
          node.state('selected', false)
        }
      })

      this.selectedNodes
        .empty()
        .add(top)
    }

    // Nodes can't be selected on init. By it's possible to select through API
    if (this.options.checkOnSelect && this.options.checkbox) {
      this.unselectAll()
    }
  }

  recurseDown(node, fn) {
    if (!fn && node) {
      fn = node
      node = this.model
    }

    if ('function' != typeof fn) {
      new TypeError('Argument must be a function')
    }

    return recurseDown(node, fn)
  }


  select(node, extendList) {
    const treeNode = this.getNode(node)

    if (!treeNode) {
      return false
    }

    if (this.options.multiple && extendList) {
      this.selectedNodes.add(treeNode)
    } else {
      this.unselectAll()
      this.selectedNodes
        .empty()
        .add(treeNode)
    }

    return true
  }

  selectAll() {
    if (!this.options.multiple) {
      return false
    }

    this.selectedNodes.empty()

    this.recurseDown(node => {
      this.selectedNodes.add(
        node.select(true)
      )
    })

    return true
  }

  unselect(node) {
    const treeNode = this.getNode(node)

    if (!treeNode) {
      return false
    }

    this.selectedNodes.remove(treeNode)

    return true
  }

  unselectAll() {
    let node

    while (node = this.selectedNodes.pop()) {
      node.unselect()
    }

    return true
  }


  check(node) {
    this.checkedNodes.add(node)
  }

  uncheck(node) {
    this.checkedNodes.remove(node)
  }

  checkAll() {
    this.recurseDown(node => {
      if (0 == node.depth) {
        if (node.indeterminate()) {
          node.state('indeterminate', false)
        }

        node.check()
      }
    })
  }

  uncheckAll() {
    let node

    while (node = this.checkedNodes.pop()) {
      node.uncheck()
    }

    return true
  }


  expand(node) {
    if (node.expanded()) {
      return false
    }

    node.expand()

    return true
  }

  collapse(node) {
    if (node.collapsed()) {
      return false
    }

    node.collapse()

    return true
  }

  toggleExpand(node) {
    if (!node.hasChildren()) {
      return false
    }

    node.toggleExpand()

    return true
  }

  toggleCollapse(node) {
    if (!node.hasChildren()) {
      return false
    }

    node.toggleCollapse()

    return true
  }

  expandAll() {
    this.recurseDown(node => {
      if (node.hasChildren() && node.collapsed()) {
        node.expand()
      }
    })
  }

  collapseAll() {
    this.recurseDown(node => {
      if (node.hasChildren() && node.expanded()) {
        node.collapse()
      }
    })
  }


  index(node, verbose) {
    let target = node.parent

    if (target) {
      target = target.children
    } else {
      target = this.model
    }

    let index = target.indexOf(node)

    if (verbose) {
      return {
        index: index,
        target,
        node: target[index]
      }
    }

    return index
  }

  nextNode(node) {
    let { target, index } = this.index(node, true)

    return target[index + 1] || null
  }

  nextVisibleNode(node) {
    if (node.hasChildren() && node.expanded()) {
      return node.first()
    }

    let nextNode = this.nextNode(node)

    if (!nextNode && node.parent) {
      return node.parent.next()
    }

    return nextNode
  }

  prevNode(node) {
    let { target, index } = this.index(node, true)

    return target[index - 1] || null
  }

  prevVisibleNode(node) {
    let prevNode = this.prevNode(node)

    if (!prevNode) {
      return node.parent
    }

    if (prevNode.hasChildren() && prevNode.expanded()) {
      return prevNode.last()
    }

    return prevNode
  }



  addToModel(node, index = this.model.length) {
    node = this.objectToNode(node)

    this.model.splice(index, 0, node)
    this.recurseDown(node, n => {
      n.tree = this
    })

    this.$emit('node:added', node)
  }


  append(criteria, node) {
    let targetNode = this.find(criteria)

    if (targetNode) {
      return targetNode.append(node)
    }

    return false
  }

  prepend(criteria, node) {
    let targetNode = this.find(criteria)

    if (targetNode) {
      return targetNode.prepend(node)
    }

    return false
  }

  before(targetNode, sourceNode) {
    targetNode = this.find(targetNode)

    let position = this.index(targetNode, true)
    let node = this.objectToNode(sourceNode)

    if (!~position.index) {
      return false
    }

    position.target.splice(
      position.index,
      0,
      node
    )

    this.$emit('node:added', node)

    return sourceNode
  }

  after(targetNode, sourceNode) {
    targetNode = this.find(targetNode)

    let position = this.index(targetNode, true)
    let node = this.objectToNode(sourceNode)

    if (!~position.index) {
      return false
    }

    position.target.splice(
      position.index + 1,
      0,
      node
    )

    this.$emit('node:added', node)

    return sourceNode
  }



  addNode(node) {
    const index = this.model.length

    node = objectToNode(node)

    this.model.splice(index, 0, node)
    this.$emit('node:added', node)

    return node
  }

  remove(criteria, multiple) {
    return this.removeNode(
      this.find(criteria, multiple)
    )
  }

  removeNode(node) {
    if (node instanceof Selection) {
      return node.remove()
    }

    if (!node) {
      return false
    }

    if (!node.parent) {
      if (~this.model.indexOf(node)) {
        this.model.splice(
          this.model.indexOf(node),
          1
        )
      }
    } else {
      let children = node.parent.children

      if (~children.indexOf(node)) {
        children.splice(
          children.indexOf(node),
          1
        )
      }
    }

    if (node.parent) {
      if (node.parent.indeterminate() && !node.parent.hasChildren()) {
        node.parent.state('indeterminate', false)
      }
    }

    node.parent = null

    this.$emit('node:removed', node)

    this.selectedNodes.remove(node)
    this.checkedNodes.remove(node)

    return node
  }




  isNode(node) {
    return node instanceof Node
  }


  find(criteria, multiple) {
    if (criteria instanceof Node) {
      return criteria
    }

    let result = find(this.model, criteria)

    if (!result || !result.length) {
      return null
    }

    if (true === multiple) {
      return new Selection(this, result)
    }

    return new Selection(this, [result[0]])
  }

  getNode(node) {
    if (node instanceof Node) {
      return node
    }

    return null
  }

  objectToNode(obj) {
    return objectToNode(this, obj)
  }

  parse(data, options) {
    if (!options) {
      options = this.options.propertyNames
    }

    try {
      return TreeParser.parse(data, this, options)
    } catch(e) {
      console.error(e)
      return []
    }
  }
}
