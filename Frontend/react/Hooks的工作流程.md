# Hooks 的工作流程

## Hooks 的数据结构

```js
var hook = {
	memoizedState: null,
	baseState: null,
	baseQueue: null,
	queue: null,
	next: null,
};
```

### memoizedState

用于保存自身数据，`hook`类型的不同保存的数据也不尽相同，特别的，`useContext`不使用该属性保存数据

| hook        | example                                           | memoizedState       |
| ----------- | ------------------------------------------------- | ------------------- |
| useState    | `const [state,updateState] = useState(initial)`   | state               |
| useReducer  | `const [state,dispatch] = useReducer(reducer,{})` | state               |
| useEffect   | `useEffect(cb,[...deps])`                         | `cb`与`[...deps]`   |
| useRef      | `useRef(initial)`                                 | `{current:initial}` |
| useMemo     | `useMemo(cb,[...deps])`                           | `[cb(),[...deps]]`  |
| useCallback | `useCallback(cb,[...deps])`                       | `[cb,[...deps]]`    |

### baseState

### baseQueue

### queue

### next

## 执行流程

1. `render`阶段之前，在`renderWithHook`方法中确定`hook`的执行上下文

```js
// 当存在current，并且current上有hook数据
// 满足该条件就意味着当前是update
if (current !== null && current.memoizedState !== null) {
	ReactCurrentDispatcher$1.current = HooksDispatcherOnUpdateInDEV;
} elseelse {
	ReactCurrentDispatcher$1.current = HooksDispatcherOnMountInDEV;
}
```

2. 根据流程的不同做不同处理
    1. 进入`mount`流程，执行`mountXXX`方法，例如`mountState`
    2. 进入`update`流程，执行`updateXXX`方法，例如`updateState`
3. 其他情况，根据执行上下文做不同处理

### ReactCurrentDispatcher.current

在源码中组件挂载和更新的`hook`来自不同的`dispatcher`，`ReactCurrentDispatcher.current`是指针

> 确定`hook`执行上下文指向可以对错误使用`hook`进行警告。执行`hook`实际调用的是某一个上下文中的对应的`hook`方法，对于

### 对应逻辑与`mount/updateWorkInProgressHook`
