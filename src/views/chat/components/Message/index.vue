<script setup lang='ts'>
import { computed, ref, watch, onUnmounted } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import AvatarComponent from './Avatar.vue'
import TextComponent from './Text.vue'
import { SvgIcon } from '@/components/common'
import { useIconRender } from '@/hooks/useIconRender'
import { t } from '@/locales'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { copyToClip } from '@/utils/copy'
import { homeStore } from '@/store'
import { getSeed, mlog, mjImgUrl } from '@/api'
import MarkdownIt from 'markdown-it'

interface Props {
	dateTime?: string
	text?: string
	inversion?: boolean
	error?: boolean
	loading?: boolean
	chat: Chat.Chat
	index: number
}

interface Emit {
	(ev: 'regenerate'): void
	(ev: 'delete'): void
}


// 在组件内初始化 Markdown 解析器
const md = new MarkdownIt({
	html: true,       // 允许 HTML 标签
	linkify: true,    // 自动转换链接
	breaks: true      // 换行转换为 <br>
})

// 新增计算属性：将 response 转换为 HTML
const renderedResponse = computed(() => {
	return md.render(fullResponse.value || '')
})
const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const { isMobile } = useBasicLayout()

const { iconRender } = useIconRender()

const message = useMessage()

const textRef = ref<HTMLElement>()

const asRawText = ref(props.inversion)

const messageRef = ref<HTMLElement>()

// 打印机效果的状态变量
const displayedThink = ref('')
const displayedResponse = ref('')
const typingSpeed = 20
const typingTimer = ref<number | null>(null)
const isTyping = ref(false)
const hasProcessedIncrementalUpdate = ref(false)

// 实际内容存储
const fullThink = ref('')
const fullResponse = ref('')

// 监听props.text变化，处理初始/完整内容
watch(() => props.text, (newText) => {
	if (props.inversion || !newText) return;

	// 如果已经收到过增量更新，则不再从props.text处理数据
	// 这可以防止增量更新后，又被完整内容覆盖
	if (hasProcessedIncrementalUpdate.value) return;

	const content = newText;
	const thinkStart = content.indexOf('<think>');
	const thinkEnd = content.indexOf('</think>');

	if (thinkStart > -1 && thinkEnd > -1) {
		fullThink.value = content.slice(thinkStart + 7, thinkEnd);
		fullResponse.value = content.slice(thinkEnd + 8);
	} else {
		fullThink.value = '';
		fullResponse.value = content;
	}

	// 更新显示内容
	displayedThink.value = fullThink.value;
	displayedResponse.value = fullResponse.value;
}, { immediate: true });

// 监听homeStore.myData，处理增量更新
watch(() => homeStore.myData, (data) => {
	// 只处理相关的增量更新
	if (data.act !== 'incremental-update' ||
		!data.actData ||
		data.actData.uuid !== props.chat.uuid ||
		data.actData.index !== props.index) {
		return;
	}

	// 标记已处理过增量更新
	hasProcessedIncrementalUpdate.value = true;

	const content = data.actData.content;
	const type = data.actData.type;

	// 根据类型更新不同内容
	if (type === 'think') {
		fullThink.value += content;
	} else if (type === 'main') {
		fullResponse.value += content;
	}

	// 更新显示内容
	if (!isTyping.value) {
		startTypingEffect();
	}
}, { deep: true });


// 打印机效果实现
function startTypingEffect() {
	if (typingTimer.value) clearInterval(typingTimer.value);

	isTyping.value = true;

	// 优先打印 think 内容
	if (displayedThink.value.length < fullThink.value.length) {
		typingTimer.value = window.setInterval(() => {
			if (displayedThink.value.length < fullThink.value.length) {
				displayedThink.value = fullThink.value.substring(0, displayedThink.value.length + 1);
			} else {
				// think 打印完成后开始打印 response
				clearInterval(typingTimer.value);
				startResponseTyping();
			}
		}, typingSpeed);
	} else {
		// 直接打印 response
		startResponseTyping();
	}
}


// 显示response部分的打印效果
function startResponseTyping() {
	typingTimer.value = window.setInterval(() => {
		if (displayedResponse.value.length < fullResponse.value.length) {
			displayedResponse.value = fullResponse.value.substring(0, displayedResponse.value.length + 1);
		} else {
			clearInterval(typingTimer.value!);
			isTyping.value = false;
		}
	}, typingSpeed);
}

// 组件卸载时清理资源
onUnmounted(() => {
	if (typingTimer.value) {
		clearInterval(typingTimer.value)
	}
})

const options = computed(() => {
	const common = [
		{
			label: t('chat.copy'),
			key: 'copyText',
			icon: iconRender({ icon: 'ri:file-copy-2-line' }),
		},
		{
			label: t('common.delete'),
			key: 'delete',
			icon: iconRender({ icon: 'ri:delete-bin-line' }),
		},
	]

	if (!props.inversion) {
		common.unshift({
			label: asRawText.value ? t('chat.preview') : t('chat.showRawText'),
			key: 'toggleRenderType',
			icon: iconRender({ icon: asRawText.value ? 'ic:outline-code-off' : 'ic:outline-code' }),
		});
		common.unshift({
			label: t('mj.tts'),
			key: 'tts',
			icon: iconRender({ icon: 'mdi:tts' }),
		})
	}

	return common
})

function handleSelect(key: 'copyText' | 'delete' | 'toggleRenderType' | 'tts') {
	switch (key) {
		case 'tts':
			homeStore.setMyData({ act: 'gpt.ttsv2', actData: { index: props.index, uuid: props.chat.uuid, text: props.text } });
			return;
		case 'copyText':
			handleCopy()
			return
		case 'toggleRenderType':
			asRawText.value = !asRawText.value
			return
		case 'delete':
			emit('delete')
	}
}

async function handleCopy(txt?: string) {
	try {
		await copyToClip(txt || props.text || '')
		message.success(t('chat.copied'))
	}
	catch {
		message.error(t('mj.copyFail'))
	}
}

const sendReload = () => {
	homeStore.setMyData({ act: 'mjReload', actData: { mjID: props.chat.mjID } })
}

function handleRegenerate2() {
	messageRef.value?.scrollIntoView()
	mlog('重新发送！');
	homeStore.setMyData({ act: 'gpt.resubmit', actData: { index: props.index, uuid: props.chat.uuid } });
}

// 计算属性保持原样，但我们会使用显示内容替代
const splitContent = computed(() => {
	// 判断是否有思考内容
	const hasThink = fullThink.value.length > 0

	return {
		hasThink,
		// 使用打印机效果显示的内容
		think: displayedThink.value,
		response: displayedResponse.value
	}
})
</script>

<template>
	<div
		ref="messageRef"
		class="flex w-full mb-6 overflow-hidden"
		:class="[{ 'flex-row-reverse': inversion }]"
	>
		<div
			class="flex items-center justify-center flex-shrink-0 h-8 overflow-hidden rounded-full basis-8"
			:class="[inversion ? 'ml-2' : 'mr-2']"
		>
			<AvatarComponent :image="inversion" :logo="chat.logo"/>
		</div>
		<div class="overflow-hidden text-sm " :class="[inversion ? 'items-end' : 'items-start']">
			<p class="text-xs group  text-[#b4bbc4] flex  items-center space-x-2 " :class="[inversion ? 'justify-end' : 'justify-start']">
				<span style="font-size: 14px; font-family: 'Karla';">{{ dateTime }}</span>
				<span v-if="chat.model"  class="text-[#b4bbc4]/50">{{ chat.model }}</span>
				<!-- <span>{{ chat.opt?.progress }}</span> -->
				<template  v-if="chat.opt?.status=='SUCCESS'">
					<SvgIcon icon="ri:restart-line" @click="sendReload"  class="cursor-pointer text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-300 " ></SvgIcon>

					<div @click="getSeed(chat, message )" class="cursor-pointer">
						<span v-if="chat.opt?.seed">Seed:{{ chat.opt?.seed }}</span>
						<span v-else>Seed</span>
					</div>
					<a :href=" mjImgUrl(chat.opt?.imageUrl)" class="hidden group-hover:block active  cursor-pointer underline " target="_blank">{{ $t('mj.ulink') }}</a>
				</template>
			</p>

			<div  class="flex items-end gap-1 mt-2"
						:class="[inversion ? 'flex-row-reverse' : 'flex-row']" >

				<div v-if="!inversion" class="message-container">
					<!-- 只显示提取后的 think 内容（不含标签） -->
					<div v-if="displayedThink" class="think-section">
						{{ displayedThink }}
					</div>
					<!-- 显示 response 内容 -->
					<div class="response-section markdown-body" v-html="renderedResponse"></div>

				</div>


				<TextComponent
					v-else
					ref="textRef"
					:inversion="inversion"
					:error="error"
					:text="text"
					:loading="loading"
					:as-raw-text="asRawText"
					:chat="chat"
				/>

				<div class="flex flex-col" v-if="!chat.mjID && chat.model!='dall-e-3' && chat.model!='dall-e-2' ">
					<!-- <button
						v-if="!inversion "
						class="mb-2 transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-300"
						@click="handleRegenerate"
					>
						<SvgIcon icon="ri:restart-line" />
					</button> -->
					<button
						v-if="!inversion "
						class="mb-2 transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-300"
						@click="handleRegenerate2"
					>
						<SvgIcon icon="ri:restart-line" />
					</button>
					<NDropdown
						:trigger="isMobile ? 'click' : 'hover'"
						:placement="!inversion ? 'right' : 'left'"
						:options="options"
						@select="handleSelect"
					>
						<button class="transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-200">
							<SvgIcon icon="ri:more-2-fill" />
						</button>
					</NDropdown>
				</div>
			</div>
		</div>
	</div>
</template>


<style scoped>
.think-card {
	border: 1px solid #374151;
	border-radius: 8px;
	background: #1F2937;
	color: white;
	width: 100%;
	margin: 8px 0;
}

.dark-theme {
	background: #111827;
	border-color: #4B5563;
}

.think-section {
	padding: 12px;
	background: rgba(107, 114, 128, 0.2);
	border-radius: 6px 6px 0 0;
	font-style: italic;
	color: #9CA3AF;
	border-bottom: 1px solid #374151;
}

.response-divider {
	height: 1px;
	background: #374151;
	margin: 0 12px;
}

.response-section {
	padding: 12px;
	color: #0f0f0f;
	line-height: 1.6;
}

/* 移动端适配 */
@media (max-width: 640px) {
	.think-card {
		border-radius: 6px;
		margin: 6px 0;
	}

	.think-section,
	.response-section {
		padding: 8px;
		font-size: 0.9rem;
	}
}

.message-container {
	border-radius: 8px;
	background: #e6f4ff;
	width: 100%;
	margin: 8px 0;
}

.think-section {
	padding: 12px;
	background: rgba(107, 114, 128, 0.2);
	border-radius: 6px 6px 0 0;
	font-style: italic;
	color: #9CA3AF;
	border-bottom: 1px solid #374151;
}

.response-section {
	padding: 12px;
	color: #0f0f0f;
	line-height: 1.6;
}

/* 移动端适配 */
@media (max-width: 640px) {
	.think-section,
	.response-section {
		padding: 10px;
		font-size: 0.9rem;
	}
}
</style>
