# Managing State

## Preserving and Resetting State

1. 组件的状态与组件在`UI`树中的位置是相关联的
2. 在相同位置的相同组件会保持状态；在相同位置的不同组件会重置状态

由于在相同位置的不同组件会重置状态，所以**我们不应该嵌套组件的函数定义**

```js
export default function App() {
	const [counter, setCounter] = useState(0);

	// 每次App渲染时，该函数都会重新创建并执行
	function NestedComponent() {}

	return (
		<>
			<NestedComponent />
			<div>App</div>
		</>
	);
}
```

特别的，重置处于相同位置的组件的状态有两种方式，用以下代码作为范例：

```js
// 使用三元表达式时，该组件的children的长度是2
function Scoreboard() {
	const [isPlayerA, setIsPlayerA] = useState(true);
	return (
		<div>
			{isPlayerA ? <Counter person="Taylor" /> : <Counter person="Sarah" />}
			<button
				onClick={() => {
					setIsPlayerA(!isPlayerA);
				}}
			>
				Next player!
			</button>
		</div>
	);
}
```

- 让组件处于不同的位置

```js
// 与三元表达式不同，这种情况，该组件的children的长度是3
function Scoreboard() {
	const [isPlayerA, setIsPlayerA] = useState(true);
	return (
		<div>
			{isPlayerA && <Counter person="Taylor" />}
			{!isPlayerA && <Counter person="Sarah" />}
			<button
				onClick={() => {
					setIsPlayerA(!isPlayerA);
				}}
			>
				Next player!
			</button>
		</div>
	);
}
```

- 使用`key`区分组件

```js
function Scoreboard() {
	const [isPlayerA, setIsPlayerA] = useState(true);
	return (
		<div>
			{isPlayerA ? (
				<Counter key="Taylor" person="Taylor" />
			) : (
				<Counter key="Sarah" person="Sarah" />
			)}
			<button
				onClick={() => {
					setIsPlayerA(!isPlayerA);
				}}
			>
				Next player!
			</button>
		</div>
	);
}
```

### Preserving state for removed components

考虑一个聊天应用的场景，我们需要在不同的聊天窗口进行切换时保留我们的输入。把它拿到`react`中，我们可以采用以下三种方案：

1. 渲染所有的窗口，但通过`css`去隐藏多余的窗口。这种方案适合界面简单，规模小的场景
2. 把状态提升到父组件中，所有窗口的状态由父组件进行管理。这是比较常用的方案
3. 使用不同的状态方案，跳出`react`，使用另外的状态源，比如`localStorage`
