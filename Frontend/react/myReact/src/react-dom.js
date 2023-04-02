// ===== 全局变量 =====
var ReactSharedInternals =
	React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

var ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;

let didReceiveUpdate = false;

let current = null;
let isRendering = false;
let renderLanes = NoLanes;
// wip fiber
let currentlyRenderingFiber = null;
let currentHook = null;
let workInProgressHook = null;
// Whether an update was scheduled at any point during the render phase. This
// does not get reset if we do another render pass; only when we're completely
// finished evaluating this component. This is an optimization so we know
// whether we need to clear render phase updates after a throw.
let didScheduleRenderPhaseUpdate = false;
// Where an update was scheduled only during the current render pass. This
// gets reset after each attempt.
// TODO: Maybe there's some way to consolidate this with
// `didScheduleRenderPhaseUpdate`. Or with `numberOfReRenders`.
let didScheduleRenderPhaseUpdateDuringThisPass = false;
const RE_RENDER_LIMIT = 25;
let localIdCounter = 0;

const HooksDispatcherOnMount = {
	readContext,
	useCallback: mountCallback,
	useContext: readContext,
	useEffect: mountEffect,
	useImperativeHandle: mountImperativeHandle,
	useLayoutEffect: mountLayoutEffect,
	useMemo: mountMemo,
	useReducer: mountReducer,
	useRef: mountRef,
	useState: mountState,
	useTransition: mountTransition,
};

const HooksDispatcherOnUpdate = {
	readContext,
	useCallback: updateCallback,
	useContext: readContext,
	useEffect: updateEffect,
	useImperativeHandle: updateImperativeHandle,
	useLayoutEffect: updateLayoutEffect,
	useMemo: updateMemo,
	useReducer: updateReducer,
	useRef: updateRef,
	useState: updateState,
	useTransition: updateTransition,
};

const HooksDispatcherOnRerender = {
	readContext,
	useCallback: updateCallback,
	useContext: readContext,
	useEffect: updateEffect,
	useImperativeHandle: updateImperativeHandle,
	useLayoutEffect: updateLayoutEffect,
	useMemo: updateMemo,
	useReducer: rerenderReducer,
	useRef: updateRef,
	useState: rerenderState,
	useTransition: rerenderTransition,
};

const ContextOnlyDispatcher = {
	readContext,
	useCallback: throwInvalidHookError,
	useContext: throwInvalidHookError,
	useEffect: throwInvalidHookError,
	useImperativeHandle: throwInvalidHookError,
	useLayoutEffect: throwInvalidHookError,
	useMemo: throwInvalidHookError,
	useReducer: throwInvalidHookError,
	useRef: throwInvalidHookError,
	useState: throwInvalidHookError,
	useTransition: throwInvalidHookError,
};

// ===== 全局变量 end =====

function throwInvalidHookError() {
	throw new Error(
		"Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for" +
			" one of the following reasons:\n" +
			"1. You might have mismatching versions of React and the renderer (such as React DOM)\n" +
			"2. You might be breaking the Rules of Hooks\n" +
			"3. You might have more than one copy of React in the same app\n" +
			"See https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem."
	);
}

function resetCurrentFiber() {
	current = null;
	isRendering = false;
}
function setCurrentFiber(fiber) {
	current = fiber;
	isRendering = false;
}
function getCurrentFiber() {
	return current;
}
function setIsRendering(rendering) {
	isRendering = rendering;
}

function mountState(initialState) {
	const hook = mountWorkInProgressHook();
	if (typeof initialState === "function") {
		initialState = initialState();
	}
	hook.memoizedState = hook.baseState = initialState;
	const queue = {
		pending: null,
		lanes: NoLanes,
		dispatch: null,
		lastRenderedReducer: basicStateReducer,
		lastRenderedState: initialState,
	};
	hook.queue = queue;
	const dispatch = (queue.dispatch = dispatchSetState.bind(
		null,
		currentlyRenderingFiber,
		queue
	));
	return [hook.memoizedState, dispatch];
}

function updateState(initialState) {
	return updateReducer(basicStateReducer, initialState);
}

function mountEffect(create, deps) {
	return mountEffectImpl(
		PassiveEffect | PassiveStaticEffect,
		HookPassive,
		create,
		deps
	);
}

function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	currentlyRenderingFiber.flags |= fiberFlags;
	hook.memoizedState = pushEffect(
		HookHasEffect | hookFlags,
		create,
		undefined,
		nextDeps
	);
}

function updateEffect(create, deps) {
	return updateEffectImpl(PassiveEffect, HookPassive, create, deps);
}

function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy = undefined;

	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState;
		destroy = prevEffect.destroy;
		if (nextDeps !== null) {
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(
					hookFlags,
					create,
					destroy,
					nextDeps
				);
				return;
			}
		}
	}

	currentlyRenderingFiber.flags |= fiberFlags;

	hook.memoizedState = pushEffect(
		HookHasEffect | hookFlags,
		create,
		destroy,
		nextDeps
	);
}

function basicStateReducer(state, action) {
	return typeof action === "function" ? action(state) : action;
}

function updateReducer(reducer, initialArg, init) {
	const hook = updateWorkInProgressHook();
	const queue = hook.queue;

	if (queue === null) {
		throw new Error(
			"Should have a queue. This is likely a bug in React. Please file an issue."
		);
	}

	queue.lastRenderedReducer = reducer;

	const current = currentHook;

	// The last rebase update that is NOT part of the base state.
	let baseQueue = current.baseQueue;

	// The last pending update that hasn't been processed yet.
	const pendingQueue = queue.pending;
	if (pendingQueue !== null) {
		// We have new updates that haven't been processed yet.
		// We'll add them to the base queue.
		if (baseQueue !== null) {
			// Merge the pending queue and the base queue.
			const baseFirst = baseQueue.next;
			const pendingFirst = pendingQueue.next;
			baseQueue.next = pendingFirst;
			pendingQueue.next = baseFirst;
		}
		current.baseQueue = baseQueue = pendingQueue;
		queue.pending = null;
	}

	if (baseQueue !== null) {
		// We have a queue to process.
		const first = baseQueue.next;
		let newState = current.baseState;

		let newBaseState = null;
		let newBaseQueueFirst = null;
		let newBaseQueueLast = null;
		let update = first;
		do {
			// An extra OffscreenLane bit is added to updates that were made to
			// a hidden tree, so that we can distinguish them from updates that were
			// already there when the tree was hidden.
			const updateLane = removeLanes(update.lane, OffscreenLane);
			const isHiddenUpdate = updateLane !== update.lane;

			// Check if this update was made while the tree was hidden. If so, then
			// it's not a "base" update and we should disregard the extra base lanes
			// that were added to renderLanes when we entered the Offscreen tree.
			const shouldSkipUpdate = isHiddenUpdate
				? !isSubsetOfLanes(
						getWorkInProgressRootRenderLanes(),
						updateLane
				  )
				: !isSubsetOfLanes(renderLanes, updateLane);

			if (shouldSkipUpdate) {
				// Priority is insufficient. Skip this update. If this is the first
				// skipped update, the previous update/state is the new base
				// update/state.
				const clone = {
					lane: updateLane,
					action: update.action,
					hasEagerState: update.hasEagerState,
					eagerState: update.eagerState,
					next: null,
				};
				if (newBaseQueueLast === null) {
					newBaseQueueFirst = newBaseQueueLast = clone;
					newBaseState = newState;
				} else {
					newBaseQueueLast = newBaseQueueLast.next = clone;
				}
				// Update the remaining priority in the queue.
				// TODO: Don't need to accumulate this. Instead, we can remove
				// renderLanes from the original lanes.
				currentlyRenderingFiber.lanes = mergeLanes(
					currentlyRenderingFiber.lanes,
					updateLane
				);
				markSkippedUpdateLanes(updateLane);
			} else {
				// This update does have sufficient priority.

				if (newBaseQueueLast !== null) {
					const clone = {
						// This update is going to be committed so we never want uncommit
						// it. Using NoLane works because 0 is a subset of all bitmasks, so
						// this will never be skipped by the check above.
						lane: NoLane,
						action: update.action,
						hasEagerState: update.hasEagerState,
						eagerState: update.eagerState,
						next: null,
					};
					newBaseQueueLast = newBaseQueueLast.next = clone;
				}

				// Process this update.
				if (update.hasEagerState) {
					// If this update is a state update (not a reducer) and was processed eagerly,
					// we can use the eagerly computed state
					newState = update.eagerState;
				} else {
					const action = update.action;
					newState = reducer(newState, action);
				}
			}
			update = update.next;
		} while (update !== null && update !== first);

		if (newBaseQueueLast === null) {
			newBaseState = newState;
		} else {
			newBaseQueueLast.next = newBaseQueueFirst;
		}

		// Mark that the fiber performed work, but only if the new state is
		// different from the current state.
		if (!is(newState, hook.memoizedState)) {
			markWorkInProgressReceivedUpdate();
		}

		hook.memoizedState = newState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueueLast;

		queue.lastRenderedState = newState;
	}

	if (baseQueue === null) {
		// `queue.lanes` is used for entangling transitions. We can set it back to
		// zero once the queue is empty.
		queue.lanes = NoLanes;
	}

	const dispatch = queue.dispatch;
	return [hook.memoizedState, dispatch];
}

// 获取mount阶段 对应的hook
function mountWorkInProgressHook() {
	const hook = {
		memoizedState: null,
		baseState: null,
		baseQueue: null,
		queue: null,
		next: null,
	};

	if (workInProgressHook === null) {
		currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
	} else {
		workInProgressHook = workInProgressHook.next = hook;
	}

	return workInProgressHook;
}

function updateWorkInProgressHook() {
	let nextCurrentHook;

	if (currentHook === null) {
		const current = currentlyRenderingFiber.alternate;
		if (current !== null) {
			nextCurrentHook = current.memoizedState;
		} else {
			nextCurrentHook = null;
		}
	} else {
		nextCurrentHook = currentHook.next;
	}

	let nextWorkInProgressHook;

	if (workInProgressHook === null) {
		nextWorkInProgressHook = currentlyRenderingFiber.memoizedState;
	} else {
		nextWorkInProgressHook = workInProgressHook.next;
	}

	if (nextWorkInProgressHook !== null) {
		// There's already a work-in-progress. Reuse it.
		workInProgressHook = nextWorkInProgressHook;
		nextWorkInProgressHook = workInProgressHook.next;
		currentHook = nextCurrentHook;
	} else {
		// Clone from the current hook.
		if (nextCurrentHook === null) {
			throw new Error(
				"Rendered more hooks than during the previous render."
			);
		}

		currentHook = nextCurrentHook;
		var newHook = {
			memoizedState: currentHook.memoizedState,
			baseState: currentHook.baseState,
			baseQueue: currentHook.baseQueue,
			queue: currentHook.queue,
			next: null,
		};

		if (workInProgressHook === null) {
			currentlyRenderingFiber.memoizedState = workInProgressHook =
				newHook;
		} else {
			workInProgressHook = workInProgressHook.next = newHook;
		}
	}

	return workInProgressHook;
}

// render阶段的开始
function workLoopConcurrent() {
	while (workInProgress !== null && !shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(unitOfWork) {
	var current = unitOfWork.alternate;
	setCurrentFiber(unitOfWork);
	var next = beginWork(current, unitOfWork, subtreeRenderLanes);
	resetCurrentFiber();
	unitOfWork.memoizedProps = unitOfWork.pendingProps;
	if (next === null) {
		completeUnitOfWork(unitOfWork);
	} else {
		workInProgress = next;
	}
	ReactCurrentOwner.current = null;
}

function completeUnitOfWork(unitOfWork) {
	// Attempt to complete the current unit of work, then move to the next
	// sibling. If there are no more siblings, return to the parent fiber.
	var completedWork = unitOfWork;

	do {
		// The current, flushed, state of this fiber is the alternate. Ideally
		// nothing should rely on this, but relying on it here means that we don't
		// need an additional field on the work in progress.
		var current = completedWork.alternate;
		var returnFiber = completedWork.return; // Check if the work completed or if something threw.

		if ((completedWork.flags & Incomplete) === NoFlags) {
			setCurrentFiber(completedWork);
			var next = void 0;

			if ((completedWork.mode & ProfileMode) === NoMode) {
				next = completeWork(current, completedWork, subtreeRenderLanes);
			} else {
				startProfilerTimer(completedWork);
				next = completeWork(current, completedWork, subtreeRenderLanes); // Update render duration assuming we didn't error.

				stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);
			}

			resetCurrentFiber();

			if (next !== null) {
				// Completing this fiber spawned new work. Work on that next.
				workInProgress = next;
				return;
			}
		} else {
			// This fiber did not complete because something threw. Pop values off
			// the stack without entering the complete phase. If this is a boundary,
			// capture values if possible.
			var _next = unwindWork(current, completedWork); // Because this fiber did not complete, don't reset its lanes.

			if (_next !== null) {
				// If completing this work spawned new work, do that next. We'll come
				// back here again.
				// Since we're restarting, remove anything that is not a host effect
				// from the effect tag.
				_next.flags &= HostEffectMask;
				workInProgress = _next;
				return;
			}

			if ((completedWork.mode & ProfileMode) !== NoMode) {
				// Record the render duration for the fiber that errored.
				stopProfilerTimerIfRunningAndRecordDelta(completedWork, false); // Include the time spent working on failed children before continuing.

				var actualDuration = completedWork.actualDuration;
				var child = completedWork.child;

				while (child !== null) {
					actualDuration += child.actualDuration;
					child = child.sibling;
				}

				completedWork.actualDuration = actualDuration;
			}

			if (returnFiber !== null) {
				// Mark the parent fiber as incomplete and clear its subtree flags.
				returnFiber.flags |= Incomplete;
				returnFiber.subtreeFlags = NoFlags;
				returnFiber.deletions = null;
			} else {
				// We've unwound all the way to the root.
				workInProgressRootExitStatus = RootDidNotComplete;
				workInProgress = null;
				return;
			}
		}

		var siblingFiber = completedWork.sibling;

		if (siblingFiber !== null) {
			// If there is more work to do in this returnFiber, do that next.
			workInProgress = siblingFiber;
			return;
		} // Otherwise, return to the parent

		completedWork = returnFiber; // Update the next thing we're working on in case something throws.

		workInProgress = completedWork;
	} while (completedWork !== null); // We've reached the root.

	if (workInProgressRootExitStatus === RootInProgress) {
		workInProgressRootExitStatus = RootCompleted;
	}
}

function beginWork(current, workInProgress, renderLanes) {
	if (current !== null) {
		const oldProps = current.memoizedProps;
		const newProps = workInProgress.pendingProps;

		if (oldProps !== newProps || hasLegacyContextChanged() || false) {
			// If props or context changed, mark the fiber as having performed work.
			// This may be unset if the props are determined to be equal later (memo).
			didReceiveUpdate = true;
		} else {
			// Neither props nor legacy context changes. Check if there's a pending
			// update or context change.
			const hasScheduledUpdateOrContext = checkScheduledUpdateOrContext(
				current,
				renderLanes
			);
			if (
				!hasScheduledUpdateOrContext &&
				// If this is the second pass of an error or suspense boundary, there
				// may not be work scheduled on `current`, so we check for this flag.
				(workInProgress.flags & DidCapture) === NoFlags
			) {
				// No pending updates or context. Bail out now.
				didReceiveUpdate = false;
				return attemptEarlyBailoutIfNoScheduledUpdate(
					current,
					workInProgress,
					renderLanes
				);
			}
			if ((current.flags & ForceUpdateForLegacySuspense) !== NoFlags) {
				// This is a special case that only exists for legacy mode.
				// See https://github.com/facebook/react/pull/19216.
				didReceiveUpdate = true;
			} else {
				// An update was scheduled on this fiber, but there are no new props
				// nor legacy context. Set this to false. If an update queue or context
				// consumer produces a changed value, it will set this to true. Otherwise,
				// the component will assume the children have not changed and bail out.
				didReceiveUpdate = false;
			}
		}
	} else {
		didReceiveUpdate = false;

		if (getIsHydrating() && isForkedChild(workInProgress)) {
			// Check if this child belongs to a list of muliple children in
			// its parent.
			//
			// In a true multi-threaded implementation, we would render children on
			// parallel threads. This would represent the beginning of a new render
			// thread for this subtree.
			//
			// We only use this for id generation during hydration, which is why the
			// logic is located in this special branch.
			const slotIndex = workInProgress.index;
			const numberOfForks = getForksAtLevel(workInProgress);
			pushTreeId(workInProgress, numberOfForks, slotIndex);
		}
	}

	// Before entering the begin phase, clear pending update priority.
	// TODO: This assumes that we're about to evaluate the component and process
	// the update queue. However, there's an exception: SimpleMemoComponent
	// sometimes bails out later in the begin phase. This indicates that we should
	// move this assignment out of the common path and into each branch.
	workInProgress.lanes = NoLanes;

	switch (workInProgress.tag) {
		case IndeterminateComponent: {
			return mountIndeterminateComponent(
				current,
				workInProgress,
				workInProgress.type,
				renderLanes
			);
		}
		case LazyComponent: {
			const elementType = workInProgress.elementType;
			return mountLazyComponent(
				current,
				workInProgress,
				elementType,
				renderLanes
			);
		}
		case FunctionComponent: {
			const Component = workInProgress.type;
			const unresolvedProps = workInProgress.pendingProps;
			const resolvedProps =
				workInProgress.elementType === Component
					? unresolvedProps
					: resolveDefaultProps(Component, unresolvedProps);
			return updateFunctionComponent(
				current,
				workInProgress,
				Component,
				resolvedProps,
				renderLanes
			);
		}
		case ClassComponent: {
			const Component = workInProgress.type;
			const unresolvedProps = workInProgress.pendingProps;
			const resolvedProps =
				workInProgress.elementType === Component
					? unresolvedProps
					: resolveDefaultProps(Component, unresolvedProps);
			return updateClassComponent(
				current,
				workInProgress,
				Component,
				resolvedProps,
				renderLanes
			);
		}
		case HostRoot:
			return updateHostRoot(current, workInProgress, renderLanes);
		case HostComponent:
			return updateHostComponent(current, workInProgress, renderLanes);
		case HostText:
			return updateHostText(current, workInProgress);
		case SuspenseComponent:
			return updateSuspenseComponent(
				current,
				workInProgress,
				renderLanes
			);
		case HostPortal:
			return updatePortalComponent(current, workInProgress, renderLanes);
		case ForwardRef: {
			const type = workInProgress.type;
			const unresolvedProps = workInProgress.pendingProps;
			const resolvedProps =
				workInProgress.elementType === type
					? unresolvedProps
					: resolveDefaultProps(type, unresolvedProps);
			return updateForwardRef(
				current,
				workInProgress,
				type,
				resolvedProps,
				renderLanes
			);
		}
		case Fragment:
			return updateFragment(current, workInProgress, renderLanes);
		case Mode:
			return updateMode(current, workInProgress, renderLanes);
		case Profiler:
			return updateProfiler(current, workInProgress, renderLanes);
		case ContextProvider:
			return updateContextProvider(current, workInProgress, renderLanes);
		case ContextConsumer:
			return updateContextConsumer(current, workInProgress, renderLanes);
		case MemoComponent: {
			const type = workInProgress.type;
			const unresolvedProps = workInProgress.pendingProps;
			// Resolve outer props first, then resolve inner props.
			let resolvedProps = resolveDefaultProps(type, unresolvedProps);
			if (__DEV__) {
				if (workInProgress.type !== workInProgress.elementType) {
					const outerPropTypes = type.propTypes;
					if (outerPropTypes) {
						checkPropTypes(
							outerPropTypes,
							resolvedProps, // Resolved for outer only
							"prop",
							getComponentNameFromType(type)
						);
					}
				}
			}
			resolvedProps = resolveDefaultProps(type.type, resolvedProps);
			return updateMemoComponent(
				current,
				workInProgress,
				type,
				resolvedProps,
				renderLanes
			);
		}
		case SimpleMemoComponent: {
			return updateSimpleMemoComponent(
				current,
				workInProgress,
				workInProgress.type,
				workInProgress.pendingProps,
				renderLanes
			);
		}
		case IncompleteClassComponent: {
			const Component = workInProgress.type;
			const unresolvedProps = workInProgress.pendingProps;
			const resolvedProps =
				workInProgress.elementType === Component
					? unresolvedProps
					: resolveDefaultProps(Component, unresolvedProps);
			return mountIncompleteClassComponent(
				current,
				workInProgress,
				Component,
				resolvedProps,
				renderLanes
			);
		}
		case SuspenseListComponent: {
			return updateSuspenseListComponent(
				current,
				workInProgress,
				renderLanes
			);
		}
		case ScopeComponent: {
			if (enableScopeAPI) {
				return updateScopeComponent(
					current,
					workInProgress,
					renderLanes
				);
			}
			break;
		}
		case OffscreenComponent: {
			return updateOffscreenComponent(
				current,
				workInProgress,
				renderLanes
			);
		}
		case LegacyHiddenComponent: {
			if (enableLegacyHidden) {
				return updateLegacyHiddenComponent(
					current,
					workInProgress,
					renderLanes
				);
			}
			break;
		}
		case CacheComponent: {
			if (enableCache) {
				return updateCacheComponent(
					current,
					workInProgress,
					renderLanes
				);
			}
			break;
		}
		case TracingMarkerComponent: {
			if (enableTransitionTracing) {
				return updateTracingMarkerComponent(
					current,
					workInProgress,
					renderLanes
				);
			}
			break;
		}
	}

	throw new Error(
		`Unknown unit of work tag (${workInProgress.tag}). This error is likely caused by a bug in ` +
			"React. Please file an issue."
	);
}

function completeWork(current, workInProgress, renderLanes) {
	var newProps = workInProgress.pendingProps; // Note: This intentionally doesn't check if we're hydrating because comparing
	// to the current tree provider fiber is just as fast and less error-prone.
	// Ideally we would have a special version of the work loop only
	// for hydration.

	popTreeContext(workInProgress);

	switch (workInProgress.tag) {
		case IndeterminateComponent:
		case LazyComponent:
		case SimpleMemoComponent:
		case FunctionComponent:
		case ForwardRef:
		case Fragment:
		case Mode:
		case Profiler:
		case ContextConsumer:
		case MemoComponent:
			bubbleProperties(workInProgress);
			return null;

		case ClassComponent: {
			var Component = workInProgress.type;

			if (isContextProvider(Component)) {
				popContext(workInProgress);
			}

			bubbleProperties(workInProgress);
			return null;
		}

		case HostRoot: {
			var fiberRoot = workInProgress.stateNode;
			popHostContainer(workInProgress);
			popTopLevelContextObject(workInProgress);
			resetWorkInProgressVersions();

			if (fiberRoot.pendingContext) {
				fiberRoot.context = fiberRoot.pendingContext;
				fiberRoot.pendingContext = null;
			}

			if (current === null || current.child === null) {
				// If we hydrated, pop so that we can delete any remaining children
				// that weren't hydrated.
				var wasHydrated = popHydrationState(workInProgress);

				if (wasHydrated) {
					// If we hydrated, then we'll need to schedule an update for
					// the commit side-effects on the root.
					markUpdate(workInProgress);
				} else {
					if (current !== null) {
						var prevState = current.memoizedState;

						if (
							// Check if this is a client root
							!prevState.isDehydrated || // Check if we reverted to client rendering (e.g. due to an error)
							(workInProgress.flags & ForceClientRender) !==
								NoFlags
						) {
							// Schedule an effect to clear this container at the start of the
							// next commit. This handles the case of React rendering into a
							// container with previous children. It's also safe to do for
							// updates too, because current.child would only be null if the
							// previous render was null (so the container would already
							// be empty).
							workInProgress.flags |= Snapshot; // If this was a forced client render, there may have been
							// recoverable errors during first hydration attempt. If so, add
							// them to a queue so we can log them in the commit phase.

							upgradeHydrationErrorsToRecoverable();
						}
					}
				}
			}

			updateHostContainer(current, workInProgress);
			bubbleProperties(workInProgress);

			return null;
		}

		case HostComponent: {
			popHostContext(workInProgress);
			var rootContainerInstance = getRootHostContainer();
			var type = workInProgress.type;

			if (current !== null && workInProgress.stateNode != null) {
				updateHostComponent$1(
					current,
					workInProgress,
					type,
					newProps,
					rootContainerInstance
				);

				if (current.ref !== workInProgress.ref) {
					markRef$1(workInProgress);
				}
			} else {
				if (!newProps) {
					if (workInProgress.stateNode === null) {
						throw new Error(
							"We must have new props for new mounts. This error is likely " +
								"caused by a bug in React. Please file an issue."
						);
					} // This can happen when we abort work.

					bubbleProperties(workInProgress);
					return null;
				}

				var currentHostContext = getHostContext(); // TODO: Move createInstance to beginWork and keep it on a context
				// "stack" as the parent. Then append children as we go in beginWork
				// or completeWork depending on whether we want to add them top->down or
				// bottom->up. Top->down is faster in IE11.

				var _wasHydrated = popHydrationState(workInProgress);

				if (_wasHydrated) {
					// TODO: Move this and createInstance step into the beginPhase
					// to consolidate.
					if (
						prepareToHydrateHostInstance(
							workInProgress,
							rootContainerInstance,
							currentHostContext
						)
					) {
						// If changes to the hydrated node need to be applied at the
						// commit-phase we mark this as such.
						markUpdate(workInProgress);
					}
				} else {
					var instance = createInstance(
						type,
						newProps,
						rootContainerInstance,
						currentHostContext,
						workInProgress
					);
					appendAllChildren(instance, workInProgress, false, false);
					workInProgress.stateNode = instance; // Certain renderers require commit-time effects for initial mount.
					// (eg DOM renderer supports auto-focus for certain elements).
					// Make sure such renderers get scheduled for later work.

					if (
						finalizeInitialChildren(
							instance,
							type,
							newProps,
							rootContainerInstance
						)
					) {
						markUpdate(workInProgress);
					}
				}

				if (workInProgress.ref !== null) {
					// If there is a ref on a host node we need to schedule a callback
					markRef$1(workInProgress);
				}
			}

			bubbleProperties(workInProgress);
			return null;
		}

		case HostText: {
			var newText = newProps;

			if (current && workInProgress.stateNode != null) {
				var oldText = current.memoizedProps; // If we have an alternate, that means this is an update and we need
				// to schedule a side-effect to do the updates.

				updateHostText$1(current, workInProgress, oldText, newText);
			} else {
				if (typeof newText !== "string") {
					if (workInProgress.stateNode === null) {
						throw new Error(
							"We must have new props for new mounts. This error is likely " +
								"caused by a bug in React. Please file an issue."
						);
					} // This can happen when we abort work.
				}

				var _rootContainerInstance = getRootHostContainer();

				var _currentHostContext = getHostContext();

				var _wasHydrated2 = popHydrationState(workInProgress);

				if (_wasHydrated2) {
					if (prepareToHydrateHostTextInstance(workInProgress)) {
						markUpdate(workInProgress);
					}
				} else {
					workInProgress.stateNode = createTextInstance(
						newText,
						_rootContainerInstance,
						_currentHostContext,
						workInProgress
					);
				}
			}

			bubbleProperties(workInProgress);
			return null;
		}

		case SuspenseComponent: {
			popSuspenseContext(workInProgress);
			var nextState = workInProgress.memoizedState; // Special path for dehydrated boundaries. We may eventually move this
			// to its own fiber type so that we can add other kinds of hydration
			// boundaries that aren't associated with a Suspense tree. In anticipation
			// of such a refactor, all the hydration logic is contained in
			// this branch.

			if (
				current === null ||
				(current.memoizedState !== null &&
					current.memoizedState.dehydrated !== null)
			) {
				var fallthroughToNormalSuspensePath =
					completeDehydratedSuspenseBoundary(
						current,
						workInProgress,
						nextState
					);

				if (!fallthroughToNormalSuspensePath) {
					if (workInProgress.flags & ShouldCapture) {
						// Special case. There were remaining unhydrated nodes. We treat
						// this as a mismatch. Revert to client rendering.
						return workInProgress;
					} else {
						// Did not finish hydrating, either because this is the initial
						// render or because something suspended.
						return null;
					}
				} // Continue with the normal Suspense path.
			}

			if ((workInProgress.flags & DidCapture) !== NoFlags) {
				// Something suspended. Re-render with the fallback children.
				workInProgress.lanes = renderLanes; // Do not reset the effect list.

				if ((workInProgress.mode & ProfileMode) !== NoMode) {
					transferActualDuration(workInProgress);
				} // Don't bubble properties in this case.

				return workInProgress;
			}

			var nextDidTimeout = nextState !== null;
			var prevDidTimeout =
				current !== null && current.memoizedState !== null;
			// a passive effect, which is when we process the transitions

			if (nextDidTimeout !== prevDidTimeout) {
				// an effect to toggle the subtree's visibility. When we switch from
				// fallback -> primary, the inner Offscreen fiber schedules this effect
				// as part of its normal complete phase. But when we switch from
				// primary -> fallback, the inner Offscreen fiber does not have a complete
				// phase. So we need to schedule its effect here.
				//
				// We also use this flag to connect/disconnect the effects, but the same
				// logic applies: when re-connecting, the Offscreen fiber's complete
				// phase will handle scheduling the effect. It's only when the fallback
				// is active that we have to do anything special.

				if (nextDidTimeout) {
					var _offscreenFiber2 = workInProgress.child;
					_offscreenFiber2.flags |= Visibility; // TODO: This will still suspend a synchronous tree if anything
					// in the concurrent tree already suspended during this render.
					// This is a known bug.

					if ((workInProgress.mode & ConcurrentMode) !== NoMode) {
						// TODO: Move this back to throwException because this is too late
						// if this is a large tree which is common for initial loads. We
						// don't know if we should restart a render or not until we get
						// this marker, and this is too late.
						// If this render already had a ping or lower pri updates,
						// and this is the first time we know we're going to suspend we
						// should be able to immediately restart from within throwException.
						var hasInvisibleChildContext =
							current === null &&
							(workInProgress.memoizedProps
								.unstable_avoidThisFallback !== true ||
								!enableSuspenseAvoidThisFallback);

						if (
							hasInvisibleChildContext ||
							hasSuspenseContext(
								suspenseStackCursor.current,
								InvisibleParentSuspenseContext
							)
						) {
							// If this was in an invisible tree or a new render, then showing
							// this boundary is ok.
							renderDidSuspend();
						} else {
							// Otherwise, we're going to have to hide content so we should
							// suspend for longer if possible.
							renderDidSuspendDelayIfPossible();
						}
					}
				}
			}

			var wakeables = workInProgress.updateQueue;

			if (wakeables !== null) {
				// Schedule an effect to attach a retry listener to the promise.
				// TODO: Move to passive phase
				workInProgress.flags |= Update;
			}

			bubbleProperties(workInProgress);

			{
				if ((workInProgress.mode & ProfileMode) !== NoMode) {
					if (nextDidTimeout) {
						// Don't count time spent in a timed out Suspense subtree as part of the base duration.
						var primaryChildFragment = workInProgress.child;

						if (primaryChildFragment !== null) {
							// $FlowFixMe Flow doesn't support type casting in combination with the -= operator
							workInProgress.treeBaseDuration -=
								primaryChildFragment.treeBaseDuration;
						}
					}
				}
			}

			return null;
		}

		case HostPortal:
			popHostContainer(workInProgress);
			updateHostContainer(current, workInProgress);

			if (current === null) {
				preparePortalMount(workInProgress.stateNode.containerInfo);
			}

			bubbleProperties(workInProgress);
			return null;

		case ContextProvider:
			// Pop provider fiber
			var context = workInProgress.type._context;
			popProvider(context, workInProgress);
			bubbleProperties(workInProgress);
			return null;

		case IncompleteClassComponent: {
			// Same as class component case. I put it down here so that the tags are
			// sequential to ensure this switch is compiled to a jump table.
			var _Component = workInProgress.type;

			if (isContextProvider(_Component)) {
				popContext(workInProgress);
			}

			bubbleProperties(workInProgress);
			return null;
		}

		case SuspenseListComponent: {
			popSuspenseContext(workInProgress);
			var renderState = workInProgress.memoizedState;

			if (renderState === null) {
				// We're running in the default, "independent" mode.
				// We don't do anything in this mode.
				bubbleProperties(workInProgress);
				return null;
			}

			var didSuspendAlready =
				(workInProgress.flags & DidCapture) !== NoFlags;
			var renderedTail = renderState.rendering;

			if (renderedTail === null) {
				// We just rendered the head.
				if (!didSuspendAlready) {
					// This is the first pass. We need to figure out if anything is still
					// suspended in the rendered set.
					// If new content unsuspended, but there's still some content that
					// didn't. Then we need to do a second pass that forces everything
					// to keep showing their fallbacks.
					// We might be suspended if something in this render pass suspended, or
					// something in the previous committed pass suspended. Otherwise,
					// there's no chance so we can skip the expensive call to
					// findFirstSuspended.
					var cannotBeSuspended =
						renderHasNotSuspendedYet() &&
						(current === null ||
							(current.flags & DidCapture) === NoFlags);

					if (!cannotBeSuspended) {
						var row = workInProgress.child;

						while (row !== null) {
							var suspended = findFirstSuspended(row);

							if (suspended !== null) {
								didSuspendAlready = true;
								workInProgress.flags |= DidCapture;
								cutOffTailIfNeeded(renderState, false); // If this is a newly suspended tree, it might not get committed as
								// part of the second pass. In that case nothing will subscribe to
								// its thenables. Instead, we'll transfer its thenables to the
								// SuspenseList so that it can retry if they resolve.
								// There might be multiple of these in the list but since we're
								// going to wait for all of them anyway, it doesn't really matter
								// which ones gets to ping. In theory we could get clever and keep
								// track of how many dependencies remain but it gets tricky because
								// in the meantime, we can add/remove/change items and dependencies.
								// We might bail out of the loop before finding any but that
								// doesn't matter since that means that the other boundaries that
								// we did find already has their listeners attached.

								var newThenables = suspended.updateQueue;

								if (newThenables !== null) {
									workInProgress.updateQueue = newThenables;
									workInProgress.flags |= Update;
								} // Rerender the whole list, but this time, we'll force fallbacks
								// to stay in place.
								// Reset the effect flags before doing the second pass since that's now invalid.
								// Reset the child fibers to their original state.

								workInProgress.subtreeFlags = NoFlags;
								resetChildFibers(workInProgress, renderLanes); // Set up the Suspense Context to force suspense and immediately
								// rerender the children.

								pushSuspenseContext(
									workInProgress,
									setShallowSuspenseContext(
										suspenseStackCursor.current,
										ForceSuspenseFallback
									)
								); // Don't bubble properties in this case.

								return workInProgress.child;
							}

							row = row.sibling;
						}
					}

					if (
						renderState.tail !== null &&
						now() > getRenderTargetTime()
					) {
						// We have already passed our CPU deadline but we still have rows
						// left in the tail. We'll just give up further attempts to render
						// the main content and only render fallbacks.
						workInProgress.flags |= DidCapture;
						didSuspendAlready = true;
						cutOffTailIfNeeded(renderState, false); // Since nothing actually suspended, there will nothing to ping this
						// to get it started back up to attempt the next item. While in terms
						// of priority this work has the same priority as this current render,
						// it's not part of the same transition once the transition has
						// committed. If it's sync, we still want to yield so that it can be
						// painted. Conceptually, this is really the same as pinging.
						// We can use any RetryLane even if it's the one currently rendering
						// since we're leaving it behind on this node.

						workInProgress.lanes = SomeRetryLane;
					}
				} else {
					cutOffTailIfNeeded(renderState, false);
				} // Next we're going to render the tail.
			} else {
				// Append the rendered row to the child list.
				if (!didSuspendAlready) {
					var _suspended = findFirstSuspended(renderedTail);

					if (_suspended !== null) {
						workInProgress.flags |= DidCapture;
						didSuspendAlready = true; // Ensure we transfer the update queue to the parent so that it doesn't
						// get lost if this row ends up dropped during a second pass.

						var _newThenables = _suspended.updateQueue;

						if (_newThenables !== null) {
							workInProgress.updateQueue = _newThenables;
							workInProgress.flags |= Update;
						}

						cutOffTailIfNeeded(renderState, true); // This might have been modified.

						if (
							renderState.tail === null &&
							renderState.tailMode === "hidden" &&
							!renderedTail.alternate &&
							!getIsHydrating() // We don't cut it if we're hydrating.
						) {
							// We're done.
							bubbleProperties(workInProgress);
							return null;
						}
					} else if (
						// The time it took to render last row is greater than the remaining
						// time we have to render. So rendering one more row would likely
						// exceed it.
						now() * 2 - renderState.renderingStartTime >
							getRenderTargetTime() &&
						renderLanes !== OffscreenLane
					) {
						// We have now passed our CPU deadline and we'll just give up further
						// attempts to render the main content and only render fallbacks.
						// The assumption is that this is usually faster.
						workInProgress.flags |= DidCapture;
						didSuspendAlready = true;
						cutOffTailIfNeeded(renderState, false); // Since nothing actually suspended, there will nothing to ping this
						// to get it started back up to attempt the next item. While in terms
						// of priority this work has the same priority as this current render,
						// it's not part of the same transition once the transition has
						// committed. If it's sync, we still want to yield so that it can be
						// painted. Conceptually, this is really the same as pinging.
						// We can use any RetryLane even if it's the one currently rendering
						// since we're leaving it behind on this node.

						workInProgress.lanes = SomeRetryLane;
					}
				}

				if (renderState.isBackwards) {
					// The effect list of the backwards tail will have been added
					// to the end. This breaks the guarantee that life-cycles fire in
					// sibling order but that isn't a strong guarantee promised by React.
					// Especially since these might also just pop in during future commits.
					// Append to the beginning of the list.
					renderedTail.sibling = workInProgress.child;
					workInProgress.child = renderedTail;
				} else {
					var previousSibling = renderState.last;

					if (previousSibling !== null) {
						previousSibling.sibling = renderedTail;
					} else {
						workInProgress.child = renderedTail;
					}

					renderState.last = renderedTail;
				}
			}

			if (renderState.tail !== null) {
				// We still have tail rows to render.
				// Pop a row.
				var next = renderState.tail;
				renderState.rendering = next;
				renderState.tail = next.sibling;
				renderState.renderingStartTime = now();
				next.sibling = null; // Restore the context.
				// TODO: We can probably just avoid popping it instead and only
				// setting it the first time we go from not suspended to suspended.

				var suspenseContext = suspenseStackCursor.current;

				if (didSuspendAlready) {
					suspenseContext = setShallowSuspenseContext(
						suspenseContext,
						ForceSuspenseFallback
					);
				} else {
					suspenseContext =
						setDefaultShallowSuspenseContext(suspenseContext);
				}

				pushSuspenseContext(workInProgress, suspenseContext); // Do a pass over the next row.
				// Don't bubble properties in this case.

				return next;
			}

			bubbleProperties(workInProgress);
			return null;
		}

		case ScopeComponent: {
			break;
		}

		case OffscreenComponent:
		case LegacyHiddenComponent: {
			popRenderLanes(workInProgress);
			var _nextState = workInProgress.memoizedState;
			var nextIsHidden = _nextState !== null;

			if (current !== null) {
				var _prevState = current.memoizedState;
				var prevIsHidden = _prevState !== null;

				if (
					prevIsHidden !== nextIsHidden && // LegacyHidden doesn't do any hiding — it only pre-renders.
					!enableLegacyHidden
				) {
					workInProgress.flags |= Visibility;
				}
			}

			if (
				!nextIsHidden ||
				(workInProgress.mode & ConcurrentMode) === NoMode
			) {
				bubbleProperties(workInProgress);
			} else {
				// Don't bubble properties for hidden children unless we're rendering
				// at offscreen priority.
				if (includesSomeLane(subtreeRenderLanes, OffscreenLane)) {
					bubbleProperties(workInProgress);

					{
						// Check if there was an insertion or update in the hidden subtree.
						// If so, we need to hide those nodes in the commit phase, so
						// schedule a visibility effect.
						if (
							workInProgress.subtreeFlags &
							(Placement | Update)
						) {
							workInProgress.flags |= Visibility;
						}
					}
				}
			}
			return null;
		}

		case CacheComponent: {
			return null;
		}

		case TracingMarkerComponent: {
			return null;
		}
	}

	throw new Error(
		"Unknown unit of work tag (" +
			workInProgress.tag +
			"). This error is likely caused by a bug in " +
			"React. Please file an issue."
	);
}

function updateFunctionComponent(
	current,
	workInProgress,
	Component,
	nextProps,
	renderLanes
) {
	let context;
	if (!disableLegacyContext) {
		const unmaskedContext = getUnmaskedContext(
			workInProgress,
			Component,
			true
		);
		context = getMaskedContext(workInProgress, unmaskedContext);
	}

	let nextChildren;
	let hasId;
	prepareToReadContext(workInProgress, renderLanes);

	nextChildren = renderWithHooks(
		current,
		workInProgress,
		Component,
		nextProps,
		context,
		renderLanes
	);
	hasId = checkDidRenderIdHook();

	if (current !== null && !didReceiveUpdate) {
		bailoutHooks(current, workInProgress, renderLanes);
		return bailoutOnAlreadyFinishedWork(
			current,
			workInProgress,
			renderLanes
		);
	}

	if (getIsHydrating() && hasId) {
		pushMaterializedTreeId(workInProgress);
	}

	// React DevTools reads this flag.
	workInProgress.flags |= PerformedWork;
	reconcileChildren(current, workInProgress, nextChildren, renderLanes);
	return workInProgress.child;
}

function pushEffect(tag, create, destroy, deps) {
	// effect结构
	const effect = {
		tag,
		create,
		destroy,
		deps,
		next: null,
	};
	let componentUpdateQueue = currentlyRenderingFiber.updateQueue;
	if (componentUpdateQueue === null) {
		componentUpdateQueue = createFunctionComponentUpdateQueue();
		currentlyRenderingFiber.updateQueue = componentUpdateQueue;
		componentUpdateQueue.lastEffect = effect.next = effect;
	} else {
		const lastEffect = componentUpdateQueue.lastEffect;
		if (lastEffect === null) {
			componentUpdateQueue.lastEffect = effect.next = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			componentUpdateQueue.lastEffect = effect;
		}
	}
	return effect;
}

function renderWithHooks(
	current,
	workInProgress,
	Component,
	props,
	secondArg,
	nextRenderLanes
) {
	renderLanes = nextRenderLanes;
	currentlyRenderingFiber = workInProgress;

	workInProgress.memoizedState = null;
	workInProgress.updateQueue = null;
	workInProgress.lanes = NoLanes;

	ReactCurrentDispatcher.current =
		current === null || current.memoizedState === null
			? HooksDispatcherOnMount
			: HooksDispatcherOnUpdate;

	let children = Component(props, secondArg);

	// Check if there was a render phase update
	if (didScheduleRenderPhaseUpdateDuringThisPass) {
		// Keep rendering in a loop for as long as render phase updates continue to
		// be scheduled. Use a counter to prevent infinite loops.
		let numberOfReRenders = 0;
		do {
			didScheduleRenderPhaseUpdateDuringThisPass = false;
			localIdCounter = 0;

			if (numberOfReRenders >= RE_RENDER_LIMIT) {
				throw new Error(
					"Too many re-renders. React limits the number of renders to prevent " +
						"an infinite loop."
				);
			}

			numberOfReRenders += 1;
			// Start over from the beginning of the list
			currentHook = null;
			workInProgressHook = null;
			workInProgress.updateQueue = null;
			ReactCurrentDispatcher.current = HooksDispatcherOnRerender;
			children = Component(props, secondArg);
		} while (didScheduleRenderPhaseUpdateDuringThisPass);
	}

	// We can assume the previous dispatcher is always this one, since we set it
	// at the beginning of the render phase and there's no re-entrance.
	ReactCurrentDispatcher.current = ContextOnlyDispatcher;

	// This check uses currentHook so that it works the same in DEV and prod bundles.
	// hookTypesDev could catch more cases (e.g. context) but only in DEV bundles.
	const didRenderTooFewHooks =
		currentHook !== null && currentHook.next !== null;

	renderLanes = NoLanes;
	currentlyRenderingFiber = null;
	currentHook = null;
	workInProgressHook = null;
	didScheduleRenderPhaseUpdate = false;

	if (didRenderTooFewHooks) {
		throw new Error(
			"Rendered fewer hooks than expected. This may be caused by an accidental " +
				"early return statement."
		);
	}

	if (enableLazyContextPropagation) {
		if (current !== null) {
			if (!checkIfWorkInProgressReceivedUpdate()) {
				// If there were no changes to props or state, we need to check if there
				// was a context change. We didn't already do this because there's no
				// 1:1 correspondence between dependencies and hooks. Although, because
				// there almost always is in the common case (`readContext` is an
				// internal API), we could compare in there. OTOH, we only hit this case
				// if everything else bails out, so on the whole it might be better to
				// keep the comparison out of the common path.
				const currentDependencies = current.dependencies;
				if (
					currentDependencies !== null &&
					checkIfContextChanged(currentDependencies)
				) {
					markWorkInProgressReceivedUpdate();
				}
			}
		}
	}
	return children;
}

function commitRoot(root, recoverableErrors, transitions) {
	// TODO: This no longer makes any sense. We already wrap the mutation and
	// layout phases. Should be able to remove.
	var previousUpdateLanePriority = getCurrentUpdatePriority();
	var prevTransition = ReactCurrentBatchConfig$3.transition;

	try {
		ReactCurrentBatchConfig$3.transition = null;
		setCurrentUpdatePriority(DiscreteEventPriority);
		commitRootImpl(
			root,
			recoverableErrors,
			transitions,
			previousUpdateLanePriority
		);
	} finally {
		ReactCurrentBatchConfig$3.transition = prevTransition;
		setCurrentUpdatePriority(previousUpdateLanePriority);
	}

	return null;
}

function commitRootImpl(
	root,
	recoverableErrors,
	transitions,
	renderPriorityLevel
) {
	do {
		// `flushPassiveEffects` will call `flushSyncUpdateQueue` at the end, which
		// means `flushPassiveEffects` will sometimes result in additional
		// passive effects. So we need to keep flushing in a loop until there are
		// no more pending effects.
		// TODO: Might be better if `flushPassiveEffects` did not automatically
		// flush synchronous work at the end, to avoid factoring hazards like this.
		flushPassiveEffects();
	} while (rootWithPendingPassiveEffects !== null);

	flushRenderPhaseStrictModeWarningsInDEV();

	if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
		throw new Error("Should not already be working.");
	}

	var finishedWork = root.finishedWork;
	var lanes = root.finishedLanes;

	{
		markCommitStarted(lanes);
	}

	if (finishedWork === null) {
		{
			markCommitStopped();
		}

		return null;
	} else {
		{
			if (lanes === NoLanes) {
				error(
					"root.finishedLanes should not be empty during a commit. This is a " +
						"bug in React."
				);
			}
		}
	}

	root.finishedWork = null;
	root.finishedLanes = NoLanes;

	if (finishedWork === root.current) {
		throw new Error(
			"Cannot commit the same tree as before. This error is likely caused by " +
				"a bug in React. Please file an issue."
		);
	} // commitRoot never returns a continuation; it always finishes synchronously.
	// So we can clear these now to allow a new callback to be scheduled.

	root.callbackNode = null;
	root.callbackPriority = NoLane; // Update the first and last pending times on this root. The new first
	// pending time is whatever is left on the root fiber.

	var remainingLanes = mergeLanes(
		finishedWork.lanes,
		finishedWork.childLanes
	);
	markRootFinished(root, remainingLanes);

	if (root === workInProgressRoot) {
		// We can reset these now that they are finished.
		workInProgressRoot = null;
		workInProgress = null;
		workInProgressRootRenderLanes = NoLanes;
	} // If there are pending passive effects, schedule a callback to process them.
	// Do this as early as possible, so it is queued before anything else that
	// might get scheduled in the commit phase. (See #16714.)
	// TODO: Delete all other places that schedule the passive effect callback
	// They're redundant.

	if (
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags ||
		(finishedWork.flags & PassiveMask) !== NoFlags
	) {
		if (!rootDoesHavePassiveEffects) {
			rootDoesHavePassiveEffects = true;
			// to store it in pendingPassiveTransitions until they get processed
			// We need to pass this through as an argument to commitRoot
			// because workInProgressTransitions might have changed between
			// the previous render and commit if we throttle the commit
			// with setTimeout

			pendingPassiveTransitions = transitions;
			scheduleCallback$1(NormalPriority, function () {
				flushPassiveEffects(); // This render triggered passive effects: release the root cache pool
				// *after* passive effects fire to avoid freeing a cache pool that may
				// be referenced by a node in the tree (HostRoot, Cache boundary etc)

				return null;
			});
		}
	} // Check if there are any effects in the whole tree.
	// TODO: This is left over from the effect list implementation, where we had
	// to check for the existence of `firstEffect` to satisfy Flow. I think the
	// only other reason this optimization exists is because it affects profiling.
	// Reconsider whether this is necessary.

	var subtreeHasEffects =
		(finishedWork.subtreeFlags &
			(BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !==
		NoFlags;
	var rootHasEffect =
		(finishedWork.flags &
			(BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !==
		NoFlags;

	if (subtreeHasEffects || rootHasEffect) {
		var prevTransition = ReactCurrentBatchConfig$3.transition;
		ReactCurrentBatchConfig$3.transition = null;
		var previousPriority = getCurrentUpdatePriority();
		setCurrentUpdatePriority(DiscreteEventPriority);
		var prevExecutionContext = executionContext;
		executionContext |= CommitContext; // Reset this to null before calling lifecycles

		ReactCurrentOwner$2.current = null; // The commit phase is broken into several sub-phases. We do a separate pass
		// of the effect list for each phase: all mutation effects come before all
		// layout effects, and so on.
		// The first phase a "before mutation" phase. We use this phase to read the
		// state of the host tree right before we mutate it. This is where
		// getSnapshotBeforeUpdate is called.

		var shouldFireAfterActiveInstanceBlur = commitBeforeMutationEffects(
			root,
			finishedWork
		);

		{
			// Mark the current commit time to be shared by all Profilers in this
			// batch. This enables them to be grouped later.
			recordCommitTime();
		}

		commitMutationEffects(root, finishedWork, lanes);

		resetAfterCommit(root.containerInfo); // The work-in-progress tree is now the current tree. This must come after
		// the mutation phase, so that the previous tree is still current during
		// componentWillUnmount, but before the layout phase, so that the finished
		// work is current during componentDidMount/Update.

		root.current = finishedWork; // The next phase is the layout phase, where we call effects that read

		{
			markLayoutEffectsStarted(lanes);
		}

		commitLayoutEffects(finishedWork, root, lanes);

		{
			markLayoutEffectsStopped();
		}
		// opportunity to paint.

		requestPaint();
		executionContext = prevExecutionContext; // Reset the priority to the previous non-sync value.

		setCurrentUpdatePriority(previousPriority);
		ReactCurrentBatchConfig$3.transition = prevTransition;
	} else {
		// No effects.
		root.current = finishedWork; // Measure these anyway so the flamegraph explicitly shows that there were
		// no effects.
		// TODO: Maybe there's a better way to report this.

		{
			recordCommitTime();
		}
	}

	var rootDidHavePassiveEffects = rootDoesHavePassiveEffects;

	if (rootDoesHavePassiveEffects) {
		// This commit has passive effects. Stash a reference to them. But don't
		// schedule a callback until after flushing layout work.
		rootDoesHavePassiveEffects = false;
		rootWithPendingPassiveEffects = root;
		pendingPassiveEffectsLanes = lanes;
	} else {
		{
			nestedPassiveUpdateCount = 0;
			rootWithPassiveNestedUpdates = null;
		}
	} // Read this again, since an effect might have updated it

	remainingLanes = root.pendingLanes; // Check if there's remaining work on this root
	// TODO: This is part of the `componentDidCatch` implementation. Its purpose
	// is to detect whether something might have called setState inside
	// `componentDidCatch`. The mechanism is known to be flawed because `setState`
	// inside `componentDidCatch` is itself flawed — that's why we recommend
	// `getDerivedStateFromError` instead. However, it could be improved by
	// checking if remainingLanes includes Sync work, instead of whether there's
	// any work remaining at all (which would also include stuff like Suspense
	// retries or transitions). It's been like this for a while, though, so fixing
	// it probably isn't that urgent.

	if (remainingLanes === NoLanes) {
		// If there's no remaining work, we can clear the set of already failed
		// error boundaries.
		legacyErrorBoundariesThatAlreadyFailed = null;
	}

	{
		if (!rootDidHavePassiveEffects) {
			commitDoubleInvokeEffectsInDEV(root.current, false);
		}
	}

	onCommitRoot(finishedWork.stateNode, renderPriorityLevel);

	{
		if (isDevToolsPresent) {
			root.memoizedUpdaters.clear();
		}
	}

	{
		onCommitRoot$1();
	} // Always call this before exiting `commitRoot`, to ensure that any
	// additional work on this root is scheduled.

	ensureRootIsScheduled(root, now());

	if (recoverableErrors !== null) {
		// There were errors during this render, but recovered from them without
		// needing to surface it to the UI. We log them here.
		var onRecoverableError = root.onRecoverableError;

		for (var i = 0; i < recoverableErrors.length; i++) {
			var recoverableError = recoverableErrors[i];
			var componentStack = recoverableError.stack;
			var digest = recoverableError.digest;
			onRecoverableError(recoverableError.value, {
				componentStack: componentStack,
				digest: digest,
			});
		}
	}

	if (hasUncaughtError) {
		hasUncaughtError = false;
		var error$1 = firstUncaughtError;
		firstUncaughtError = null;
		throw error$1;
	} // If the passive effects are the result of a discrete render, flush them
	// synchronously at the end of the current task so that the result is
	// immediately observable. Otherwise, we assume that they are not
	// order-dependent and do not need to be observed by external systems, so we
	// can wait until after paint.
	// TODO: We can optimize this by not scheduling the callback earlier. Since we
	// currently schedule the callback in multiple places, will wait until those
	// are consolidated.

	if (
		includesSomeLane(pendingPassiveEffectsLanes, SyncLane) &&
		root.tag !== LegacyRoot
	) {
		flushPassiveEffects();
	} // Read this again, since a passive effect might have updated it

	remainingLanes = root.pendingLanes;

	if (includesSomeLane(remainingLanes, SyncLane)) {
		{
			markNestedUpdateScheduled();
		} // Count the number of times the root synchronously re-renders without
		// finishing. If there are too many, it indicates an infinite update loop.

		if (root === rootWithNestedUpdates) {
			nestedUpdateCount++;
		} else {
			nestedUpdateCount = 0;
			rootWithNestedUpdates = root;
		}
	} else {
		nestedUpdateCount = 0;
	} // If layout work was scheduled, flush it now.

	flushSyncCallbacks();

	{
		markCommitStopped();
	}

	return null;
}
