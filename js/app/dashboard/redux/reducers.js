import { combineReducers } from 'redux'
import _ from 'lodash'
import Moment from 'moment'
import { extendMoment } from 'moment-range'

import {
  ASSIGN_TASKS,
  ADD_CREATED_TASK,
  REMOVE_TASKS,
  UPDATE_TASK,
  OPEN_ADD_USER,
  CLOSE_ADD_USER,
  MODIFY_TASK_LIST_REQUEST,
  MODIFY_TASK_LIST_REQUEST_SUCCESS,
  TOGGLE_POLYLINE,
  TOGGLE_TASK,
  SELECT_TASK,
  SET_TASK_LIST_GROUP_MODE,
  ADD_TASK_LIST_REQUEST,
  ADD_TASK_LIST_REQUEST_SUCCESS,
  SET_GEOLOCATION,
  SET_OFFLINE,
  DRAKE_DRAG,
  DRAKE_DRAGEND,
  OPEN_NEW_TASK_MODAL,
  CLOSE_NEW_TASK_MODAL,
  SET_CURRENT_TASK,
  CREATE_TASK_REQUEST,
  CREATE_TASK_SUCCESS,
  CREATE_TASK_FAILURE,
  COMPLETE_TASK_FAILURE,
  CANCEL_TASK_FAILURE,
  TOKEN_REFRESH_SUCCESS,
  OPEN_FILTERS_MODAL,
  CLOSE_FILTERS_MODAL,
  SET_FILTER_VALUE,
  RESET_FILTERS,
} from './actions'

import { createTaskList } from './utils'

const moment = extendMoment(Moment)

const taskComparator = (taskA, taskB) => taskA['@id'] === taskB['@id']

const replaceOrAddTask = (tasks, task) => {

  const taskIndex = _.findIndex(tasks, t => t['@id'] === task['@id'])

  if (-1 !== taskIndex) {

    const newTasks = tasks.slice(0)
    newTasks.splice(taskIndex, 1, Object.assign({}, tasks[taskIndex], task))

    return newTasks
  }

  return tasks.concat([ task ])
}

const removeTask = (tasks, task) => _.filter(tasks, t => t['@id'] !== task['@id'])

const defaultFilters = {
  showFinishedTasks: true,
  showCancelledTasks: false,
  tags: [],
  hiddenCouriers: []
}

const initialState = {

  allTasks: [],
  unassignedTasks: [],
  taskLists: [],
  date: moment(),

  taskListsLoading: false,
  addModalIsOpen: false,
  polylineEnabled: {},
  taskListGroupMode: 'GROUP_MODE_FOLDERS',
  tags: [],

  filters: defaultFilters,
  isDefaultFilters: true,

  selectedTasks: [],
  jwt: '',
  positions: [],
  offline: [],
  isDragging: false,
  taskModalIsOpen: false,
  currentTask: null,
  isTaskModalLoading: false,
  couriersList: [],
  completeTaskErrorMessage: null,
  filtersModalIsOpen: false
}

const rootReducer = (state = initialState, action) => {
  switch (action.type) {
  case UPDATE_TASK:

    const dateAsRange = moment.range(
      moment(state.date).set({ hour:  0, minute:  0, second:  0 }),
      moment(state.date).set({ hour: 23, minute: 59, second: 59 })
    )

    const range = moment.range(
      moment(action.task.doneAfter),
      moment(action.task.doneBefore)
    )

    if (!range.overlaps(dateAsRange)) {

      return state
    }

    let newUnassignedTasks = state.unassignedTasks.slice(0)
    let newTaskLists = state.taskLists.slice(0)

    let unassignedTasksIndex = _.findIndex(state.unassignedTasks, task => task['@id'] === action.task['@id'])
    let taskListsIndex = _.findIndex(state.taskLists, taskList => {
      return _.includes(_.map(taskList.items, task => task['@id']), action.task['@id'])
    })

    if (-1 !== unassignedTasksIndex) {
      if (action.task.isAssigned) {
        newUnassignedTasks = removeTask(state.unassignedTasks, action.task)
      } else {
        newUnassignedTasks = replaceOrAddTask(state.unassignedTasks, action.task)
      }
    } else {
      if (!action.task.isAssigned) {
        newUnassignedTasks = replaceOrAddTask(state.unassignedTasks, action.task)
      }
    }

    if (action.task.isAssigned) {

      let targetTaskListsIndex = _.findIndex(state.taskLists, taskList => taskList.username === action.task.assignedTo)

      if (-1 !== taskListsIndex) {
        if (targetTaskListsIndex !== taskListsIndex) {
          newTaskLists.splice(taskListsIndex, 1, {
            ...state.taskLists[taskListsIndex],
            items: removeTask(state.taskLists[taskListsIndex].items, action.task)
          })
        }
      }

      if (-1 !== targetTaskListsIndex) {
        newTaskLists.splice(targetTaskListsIndex, 1, {
          ...state.taskLists[targetTaskListsIndex],
          items: replaceOrAddTask(state.taskLists[targetTaskListsIndex].items, action.task)
        })
      } else {
        let newTaskList = createTaskList(action.task.assignedTo)
        newTaskList.items.push(action.task)
        newTaskLists.push(newTaskList)
      }

    } else {
      if (-1 !== taskListsIndex) {
        newTaskLists.splice(taskListsIndex, 1, {
          ...state.taskLists[taskListsIndex],
          items: removeTask(state.taskLists[taskListsIndex].items, action.task)
        })
      }
    }

    return {
      ...state,
      unassignedTasks: newUnassignedTasks,
      taskLists: newTaskLists,
    }
  }

  return state
}

function _taskLists(state = [], action, date = initialState.date) {

  let newTaskLists = state.slice(0)
  let taskListIndex
  let taskList
  let taskListItems
  let targetTaskListIndex

  switch (action.type) {

  case ASSIGN_TASKS:

    taskListIndex = _.findIndex(newTaskLists, taskList => taskList.username === action.username)
    taskList = newTaskLists[taskListIndex]

    newTaskLists.splice(taskListIndex, 1,
      Object.assign({}, taskList, { items: taskList.items.concat(action.tasks) }))

    return newTaskLists

  case REMOVE_TASKS:

    taskListIndex = _.findIndex(newTaskLists, taskList => taskList.username === action.username)
    taskList = newTaskLists[taskListIndex]

    taskListItems = _.differenceWith(
      taskList.items,
      _.intersectionWith(taskList.items, action.tasks, taskComparator),
      taskComparator
    )
    newTaskLists.splice(taskListIndex, 1,
      Object.assign({}, taskList, { items: taskListItems }))

    return newTaskLists

  case MODIFY_TASK_LIST_REQUEST_SUCCESS:

    taskListIndex = _.findIndex(newTaskLists, taskList => taskList['@id'] === action.taskList['@id'])

    newTaskLists.splice(taskListIndex, 1,
      Object.assign({}, action.taskList, { items: action.taskList.items }))

    return newTaskLists

  case ADD_TASK_LIST_REQUEST_SUCCESS:

    newTaskLists.push(action.taskList)

    return newTaskLists

  case ADD_CREATED_TASK:

    if (!moment(action.task.doneBefore).isSame(date, 'day')) {
      return newTaskLists
    }

    if (action.task.isAssigned) {
      taskListIndex = _.findIndex(newTaskLists, taskList => taskList.username === action.task.assignedTo)

      if (taskListIndex && !_.find(taskList.items, (task) => { task['id'] === action.task.id })) {
        taskList = newTaskLists[taskListIndex]
        taskListItems = Array.prototype.concat(taskList.items, [action.task])
        newTaskLists.splice(taskListIndex, 1,
          Object.assign({}, taskList, { items: taskListItems })
        )
      } else {
        let newTaskList = createTaskList(action.task.assignedTo)
        newTaskList.items.push(action.task)
        newTaskLists.push(newTaskList)
      }

      return newTaskLists
    }

    break
  }

  return state
}

/*
  Store for all unassigned tasks
 */
function _unassignedTasks(state = [], action, date = initialState.date) {
  let newState

  switch (action.type) {

  case ADD_CREATED_TASK:
    if (!moment(action.task.doneBefore).isSame(date, 'day')) {
      return state
    }
    if (!_.find(state, (task) => { task['id'] === action.task.id })) {
      newState = state.slice(0)
      return Array.prototype.concat(newState, [ action.task ])
    }
    break

  case ASSIGN_TASKS:
    newState = state.slice(0)
    newState = _.differenceWith(
      newState,
      _.intersectionWith(newState, action.tasks, taskComparator),
      taskComparator
    )
    return newState

  case REMOVE_TASKS:
    return Array.prototype.concat(state, action.tasks)
  }

  return state
}

function _allTasks(state = [], action, date = initialState.date) {
  let newState

  switch (action.type) {

  case ADD_CREATED_TASK:
    if (!moment(action.task.doneBefore).isSame(date, 'day')) {
      return state
    }

    newState = state.slice(0)
    return Array.prototype.concat(newState, [ action.task ])

  // case 'UPDATE_TASK':
  //   break;
  }

  return state
}

export const addModalIsOpen = (state = false, action) => {
  switch(action.type) {
  case OPEN_ADD_USER:
    return true
  case CLOSE_ADD_USER:
    return false
  default:
    return state
  }
}

export const taskListsLoading = (state = false, action) => {
  switch(action.type) {
  case ADD_TASK_LIST_REQUEST:
  case MODIFY_TASK_LIST_REQUEST:
    return true
  case ADD_TASK_LIST_REQUEST_SUCCESS:
  case MODIFY_TASK_LIST_REQUEST_SUCCESS:
    return false
  default:
    return state
  }
}

export const polylineEnabled = (state = {}, action) => {
  switch (action.type) {
  case TOGGLE_POLYLINE:
    let newState = { ...state }
    const { username } = action
    newState[username] = !state[username]

    return newState
  default:
    return state
  }
}

export const selectedTasks = (state = [], action) => {

  let newState = state.slice(0)

  switch (action.type) {
  case TOGGLE_TASK:

    if (-1 !== state.indexOf(action.task)) {
      if (!action.multiple) {
        return []
      }
      return _.filter(state, task => task !== action.task)
    }

    if (!action.multiple) {
      newState = []
    }
    newState.push(action.task)

    return newState

  case SELECT_TASK:

    if (-1 !== state.indexOf(action.task)) {

      return state
    }

    return [ action.task ]
  }

  return state
}

export const taskListGroupMode = (state = 'GROUP_MODE_FOLDERS', action) => {
  switch (action.type) {
  case SET_TASK_LIST_GROUP_MODE:
    return action.mode
  default:
    return state
  }
}

export const tags = (state = initialState.tags, action) => state

export const jwt = (state = '', action) => {
  switch (action.type) {
  case TOKEN_REFRESH_SUCCESS:

    return action.token

  default:

    return state
  }
}

export const date = (state = moment(), action) => state

export const couriersList = (state = [], action) => state

export const positions = (state = [], action) => {
  switch (action.type) {
  case SET_GEOLOCATION:

    const marker = {
      username: action.username,
      coords: action.coords,
      lastSeen: moment()
    }

    const newState = state.slice(0)
    const index = _.findIndex(newState, position => position.username === action.username)
    if (-1 !== index) {
      newState.splice(index, 1, marker)
    } else {
      newState.push(marker)
    }

    return newState

  default:

    return state
  }
}

export const offline = (state = [], action) => {
  let index

  switch (action.type) {
  case SET_GEOLOCATION:

    index = _.findIndex(state, username => username === action.username)
    if (-1 === index) {

      return state
    }

    return _.filter(state, username => username !== action.username)

  case SET_OFFLINE:

    index = _.findIndex(state, username => username === action.username)
    if (-1 === index) {

      return state.concat([ action.username ])
    }

  default:

    return state
  }
}

export const isDragging = (state = false, action) => {
  switch (action.type) {
  case DRAKE_DRAG:

    return true

  case DRAKE_DRAGEND:

    return false

  default:

    return state
  }
}

export const combinedTasks = (state = initialState, action) => {

  switch (action.type) {

  case ADD_CREATED_TASK:

    return {
      ...state,
      unassignedTasks: _unassignedTasks(state.unassignedTasks, action, state.date),
      taskLists: _taskLists(state.taskLists, action, state.date),
      allTasks: _allTasks(state.allTasks, action, state.date)
    }
  case UPDATE_TASK:

    const { unassignedTasks, taskLists } = rootReducer(state, action)

    return {
      ...state,
      unassignedTasks,
      taskLists,
    }
  }

  return {
    ...state,
    unassignedTasks: _unassignedTasks(state.unassignedTasks, action),
    taskLists: _taskLists(state.taskLists, action),
    allTasks: _allTasks(state.allTasks, action)
  }
}

export const taskModalIsOpen = (state = false, action) => {
  switch(action.type) {
  case OPEN_NEW_TASK_MODAL:
    return true
  case CLOSE_NEW_TASK_MODAL:
    return false
  case SET_CURRENT_TASK:

    if (!!action.task) {
      return true
    }

    return false
  default:
    return state
  }
}

export const currentTask = (state = null, action) => {
  switch(action.type) {
  case OPEN_NEW_TASK_MODAL:
    return null
  case SET_CURRENT_TASK:
    return action.task
  default:
    return state
  }
}

export const isTaskModalLoading = (state = false, action) => {
  switch(action.type) {
  case CREATE_TASK_REQUEST:
    return true
  case CREATE_TASK_SUCCESS:
  case CREATE_TASK_FAILURE:
  case COMPLETE_TASK_FAILURE:
  case CANCEL_TASK_FAILURE:
    return false
  default:
    return state
  }
}

export const completeTaskErrorMessage = (state = null, action) => {
  switch(action.type) {
  case CREATE_TASK_REQUEST:
  case CREATE_TASK_SUCCESS:
    return null
  case COMPLETE_TASK_FAILURE:

    const { error } = action

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (error.response.status === 400) {
        if (error.response.data.hasOwnProperty('@type') && error.response.data['@type'] === 'hydra:Error') {
          return error.response.data['hydra:description']
        }
      }
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
    } else {
      // Something happened in setting up the request that triggered an Error
    }
  default:
    return state
  }
}

export const filtersModalIsOpen = (state = initialState.filtersModalIsOpen, action) => {
  switch (action.type) {
  case OPEN_FILTERS_MODAL:
    return true
  case CLOSE_FILTERS_MODAL:
    return false
  default:
    return state
  }
}

export const combinedFilters = (state = initialState, action) => {

  switch (action.type) {

  case SET_FILTER_VALUE:

    const newFilters = {
      ...state.filters,
      [action.key]: action.value
    }

    return {
      ...state,
      filters: newFilters,
      isDefaultFilters: _.isEqual(newFilters, defaultFilters)
    }

  case RESET_FILTERS:

    return {
      ...state,
      filters: defaultFilters,
      isDefaultFilters: true
    }
  }

  return {
    ...state,
    filters: state.hasOwnProperty('filters') ? state.filters : initialState.filters,
    isDefaultFilters: state.hasOwnProperty('isDefaultFilters') ? state.isDefaultFilters : initialState.isDefaultFilters,
  }
}

export default (state = initialState, action) => {

  const { allTasks, unassignedTasks, taskLists } = combinedTasks(state, action)
  const { filters, isDefaultFilters } = combinedFilters(state, action)

  return {
    ...state,
    unassignedTasks,
    taskLists,
    allTasks,
    taskListsLoading: taskListsLoading(state.taskListsLoading, action),
    addModalIsOpen: addModalIsOpen(state.addModalIsOpen, action),
    polylineEnabled: polylineEnabled(state.polylineEnabled, action),
    taskListGroupMode: taskListGroupMode(state.taskListGroupMode, action),
    tags: tags(state.tags, action),
    selectedTasks: selectedTasks(state.selectedTasks, action),
    jwt: jwt(state.jwt, action),
    date: date(state.date, action),
    positions: positions(state.positions, action),
    offline: offline(state.offline, action),
    isDragging: isDragging(state.isDragging, action),
    taskModalIsOpen: taskModalIsOpen(state.taskModalIsOpen, action),
    currentTask: currentTask(state.currentTask, action),
    isTaskModalLoading: isTaskModalLoading(state.isTaskModalLoading, action),
    couriersList: couriersList(state.couriersList, action),
    completeTaskErrorMessage: completeTaskErrorMessage(state.completeTaskErrorMessage, action),
    filtersModalIsOpen: filtersModalIsOpen(state.filtersModalIsOpen, action),
    filters,
    isDefaultFilters,
  }
}
