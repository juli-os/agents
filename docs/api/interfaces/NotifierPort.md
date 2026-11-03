[**@juli-os/agents**](../index.md)

***

[@juli-os/agents](../index.md) / NotifierPort

# Interface: NotifierPort

Defined in: [platform/agents/tools.ts:49](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L49)

agent 通知器（Stop/Start 事件，版本化等待——wait_until_idle 的根）。

## Methods

### lastStatus()

> **lastStatus**(`session`): `string`

Defined in: [platform/agents/tools.ts:51](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L51)

#### Parameters

##### session

`string`

#### Returns

`string`

***

### snapshot()

> **snapshot**(`session`): `number`

Defined in: [platform/agents/tools.ts:50](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L50)

#### Parameters

##### session

`string`

#### Returns

`number`

***

### waitAfter()

> **waitAfter**(`session`, `after`): `Promise`\<`void`\> & `object`

Defined in: [platform/agents/tools.ts:54](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L54)

等待比 after 更新的通知；返回取消函数。

#### Parameters

##### session

`string`

##### after

`number`

#### Returns

`Promise`\<`void`\> & `object`

***

### working()

> **working**(`session`): `boolean`

Defined in: [platform/agents/tools.ts:52](https://github.com/juli-os/agents/blob/main/src/platform/agents/tools.ts#L52)

#### Parameters

##### session

`string`

#### Returns

`boolean`
