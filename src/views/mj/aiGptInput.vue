<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useBasicLayout } from "@/hooks/useBasicLayout";
import { t } from "@/locales";
import {
	NInput,
	NButton,
	useMessage,
	NImage,
	NTooltip,
	NAutoComplete,
	NTag,
	NPopover,
	NModal,
	NDropdown,
} from "naive-ui";
import { SvgIcon, PromptStore } from "@/components/common";
import {
	canVisionModel,
	GptUploader,
	mlog,
	upImg,
	getFileFromClipboard,
	isFileMp3,
	countTokens,
	checkDisableGpt4,
	Recognition,
	chatSetting,
} from "@/api";
import { gptConfigStore, homeStore, useChatStore } from "@/store";
import { AutoCompleteOptions } from "naive-ui/es/auto-complete/src/interface";
import { RenderLabel } from "naive-ui/es/_internal/select-menu/src/interface";
import { useRoute } from "vue-router";
import aiModel from "@/views/mj/aiModel.vue";
import AiMic from "./aiMic.vue";
import { useIconRender } from "@/hooks/useIconRender";
const { iconRender } = useIconRender();

const route = useRoute();
const chatStore = useChatStore();
const emit = defineEmits(["update:modelValue", "export", "handleClear"]);
const props = defineProps<{
	modelValue: string;
	disabled?: boolean;
	searchOptions?: AutoCompleteOptions;
	renderOption?: RenderLabel;
}>();
const fsRef = ref();
const st = ref<{
	fileBase64: string[];
	isLoad: number;
	isShow: boolean;
	showMic: boolean;
	micStart: boolean;
}>({
	fileBase64: [],
	isLoad: 0,
	isShow: false,
	showMic: false,
	micStart: false,
});
const { isMobile } = useBasicLayout();
const placeholder = computed(() => {
	if (isMobile.value) return t("chat.placeholderMobile");
	return t("chat.placeholder"); // 可输入说点什么，也可贴截图或拖拽文件
});

const { uuid } = route.params as { uuid: string };
const uuid1 = chatStore.active;
const chatSet = new chatSetting(uuid1 == null ? 1002 : uuid1);
const nGptStore = ref(chatSet.getGptConfig());
const dataSources = computed(() => chatStore.getChatByUuid(+uuid));

watch(
	() => gptConfigStore.myData,
	() => (nGptStore.value = chatSet.getGptConfig()),
	{ deep: true }
);
watch(
	() => homeStore.myData.act,
	(n) => n == "saveChat" && (nGptStore.value = chatSet.getGptConfig()),
	{ deep: true }
);
const handleSubmit = () => {
	if (mvalue.value == "") return;
	if (checkDisableGpt4(gptConfigStore.myData.model)) {
		ms.error(t("mj.disableGpt4"));
		return false;
	}
	if (homeStore.myData.isLoader) {
		return;
	}
	let obj = {
		prompt: mvalue.value,
		fileBase64: st.value.fileBase64,
	};
	homeStore.setMyData({ act: "gpt.submit", actData: obj });
	mvalue.value = "";
	st.value.fileBase64 = [];
	return false;
};
const ms = useMessage();
const mvalue = computed({
	get() {
		return props.modelValue;
	},
	set(value) {
		emit("update:modelValue", value);
	},
});
function selectFile(input: any) {
	const file = input.target.files[0];
	upFile(file);
}

const myToken = ref({ remain: 0, modelTokens: "4k" });
const funt = async () => {
	const d = await countTokens(
		dataSources.value,
		mvalue.value,
		chatStore.active ?? 1002
	);
	myToken.value = d;
	return d;
};
watch(() => mvalue.value, funt);
watch(() => dataSources.value, funt);
watch(() => gptConfigStore.myData, funt, { deep: true });
watch(() => homeStore.myData.isLoader, funt, { deep: true });
funt();

const upFile = (file: any) => {
	if (!canVisionModel(gptConfigStore.myData.model)) {
		if (isFileMp3(file.name)) {
			mlog("mp3", file);
			homeStore.setMyData({
				act: "gpt.whisper",
				actData: { file, prompt: "whisper" },
			});
			return;
		} else {
			upImg(file)
				.then((d) => {
					fsRef.value.value = "";
					if (st.value.fileBase64.findIndex((v) => v == d) > -1) {
						ms.error(t("mj.noReUpload")); // '不能重复上传'
						return;
					}
					st.value.fileBase64.push(d);
				})
				.catch((e) => ms.error(e));
		}
	} else {
		const formData = new FormData();
		formData.append("file", file);
		ms.info(t("mj.uploading"));
		st.value.isLoad = 1;
		GptUploader("/v1/upload", formData)
			.then((r) => {
				st.value.isLoad = 0;
				if (r.url) {
					ms.info(t("mj.uploadSuccess"));
					if (r.url.indexOf("http") > -1) {
						st.value.fileBase64.push(r.url);
					} else {
						st.value.fileBase64.push(location.origin + r.url);
					}
				} else if (r.error) ms.error(r.error);
			})
			.catch((e) => {
				st.value.isLoad = 0;
				ms.error(t("mj.uploadFail") + (e.message ?? JSON.stringify(e)));
			});
	}
};

function handleEnter(event: KeyboardEvent) {
	if (!isMobile.value) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSubmit();
		}
	} else {
		if (event.key === "Enter" && event.ctrlKey) {
			event.preventDefault();
			handleSubmit();
		}
	}
}

const acceptData = computed(() => {
	if (canVisionModel(gptConfigStore.myData.model)) return "*/*";
	return "image/jpeg, image/jpg, image/png, image/gif, .mp3, .mp4, .mpeg, .mpga, .m4a, .wav, .webm";
});

const drop = (e: DragEvent) => {
	e.preventDefault();
	e.stopPropagation();
	if (!e.dataTransfer || e.dataTransfer.files.length == 0) return;
	const files = e.dataTransfer.files;
	upFile(files[0]);
};

const paste = (e: ClipboardEvent) => {
	let rz = getFileFromClipboard(e);
	if (rz.length > 0) upFile(rz[0]);
};

const sendMic = (e: any) => {
	mlog("sendMic", e);
	st.value.showMic = false;
	let du = "whisper.wav";
	const file = new File([e.blob], du, { type: "audio/wav" });
	homeStore.setMyData({
		act: "gpt.whisper",
		actData: { file, prompt: "whisper", duration: e.stat?.duration },
	});
};

// 语音识别ASR
const goASR = () => {
	console.log("触发语音识别");

	const olod = mvalue.value;
	const rec = new Recognition();
	console.log("🚀 ~ goASR ~ rec:", rec);
	let rz = "";
	rec
		.setListener((r: string) => {
			rz = r;
			mvalue.value = r;
			console.log("mvalue.value1111", mvalue.value);
			st.value.micStart = true;
		})
		.setOnEnd(() => {
			mvalue.value = olod + rz;
			console.log("mvalue.value", mvalue.value);

			ms.info(t("mj.micRecEnd"));
			st.value.micStart = false;
		})
		.setOpt({
			timeOut: 3000,
			onStart: () => {
				ms.info(t("mj.micRec"));
				st.value.micStart = true;
			},
		})
		.start();
};

const drOption = [
	{
		label: t("mj.micWhisper"),
		key: "whisper",
		icon: iconRender({ icon: "ri:openai-fill" }),
	},
	{
		label: t("mj.micAsr"),
		icon: iconRender({ icon: "ri:chrome-line" }),
		key: "asr",
	},
];

const handleSelectASR = (key: string | number) => {
	console.log("*********");

	if (key == "asr") goASR();
	if (key == "whisper") st.value.showMic = true;
};

/**
 * 校验字符串的大小
 * @param inputStr 输入的字符
 * @param maxLength 字符串长度
 */
const truncateText = (inputStr: any, maxLength = 20) => {
	// 处理空值情况
	if (!inputStr) return "";
	// 类型安全校验
	const str = String(inputStr);
	// 判断并截断
	return str.length > maxLength
		? `${str.slice(0, maxLength)}...`
		: str;
};

const show = ref(false);
function handleExport() {
	emit("export");
}
function handleClear() {
	emit("handleClear");
}
</script>
<template>
	<div v-if="st.showMic" class="myinputs flex justify-center items-center">
		<AiMic @cancel="st.showMic = false" @send="sendMic" />
	</div>
	<div v-else>
		<!-- 附件预览区 -->
		<div
			class="flex flex-wrap gap-2 p-3 mx-6 mb-2 rounded-md bg-gray-50"
			v-if="st.fileBase64.length > 0"
		>
			<div
				class="w-16 h-16 rounded-md overflow-hidden shadow-sm relative group border border-gray-100 transition-all hover:shadow-md"
				v-for="(v, ii) in st.fileBase64"
				:key="ii"
			>
				<NImage :src="v" object-fit="cover" class="w-full h-full">
					<template #placeholder>
						<a
							class="w-full h-full flex items-center justify-center text-gray-500 bg-gray-100"
							:href="v"
							target="_blank"
						>
							<SvgIcon icon="mdi:download" class="mr-1" />
							{{ $t("mj.attr1") }} {{ ii + 1 }}
						</a>
					</template>
				</NImage>
				<div
					class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-red-400 text-white rounded-full p-1 cursor-pointer shadow-md"
					@click="st.fileBase64.splice(st.fileBase64.indexOf(v), 1)"
				>
					<SvgIcon icon="mdi:close" class="w-3 h-3" />
				</div>
			</div>
		</div>

		<!-- 主聊天输入区 -->
		<div
			class="chat-container"
			:class="[!isMobile ? 'desktop-chat' : 'mobile-chat']"
			@drop="drop"
			@paste="paste"
		>
			<!-- 顶部工具栏 (仅桌面端) -->
			<div class="chat-toolbar" v-if="!isMobile">
				<div class="toolbar-left" v-if="st">
					<!-- 模型选择器 -->
					<div
						v-if="homeStore.myData.local != 'draw'"
						class="model-selector"
						@click="st.isShow = true"
					>
						<template v-if="nGptStore.gpts">
							<SvgIcon icon="ri:apps-fill" class="model-icon" />
							<span class="model-name">{{ nGptStore.gpts.name }}</span>
						</template>
						<template v-else>
							<SvgIcon icon="heroicons:sparkles" class="model-icon" />
							<span class="model-name">
                模型: {{ nGptStore.modelLabel ? truncateText(nGptStore.modelLabel, 20) : "gpt-4o-mini" }}
                <span v-if="nGptStore.kid" class="knowledge-base">
                  知识库: {{ truncateText(nGptStore.kName, 10) }}
                </span>
              </span>
						</template>
						<SvgIcon icon="icon-park-outline:right" class="model-arrow" />
					</div>


				</div>

				<!-- 清空按钮 -->
				<div class="toolbar-right">
					<div class="toolbar-button" @click="handleClear">
						<IconSvg icon="clear" width="22px" height="22px" />
					</div>
				</div>
			</div>

			<!-- 文件上传输入 (隐藏) -->
			<input
				type="file"
				id="fileInput"
				@change="selectFile"
				class="hidden"
				ref="fsRef"
				:accept="acceptData"
			/>

			<!-- 文本输入区 -->
			<NAutoComplete
				v-model:value="mvalue"
				:options="searchOptions"
				round
				:render-label="renderOption"
				:class="[!isMobile ? 'chat-input' : '']"
			>
				<template #default="{ handleInput, handleBlur, handleFocus }">
					<NInput
						ref="inputRef"
						v-model:value="mvalue"
						type="textarea"
						:placeholder="placeholder"
						rows="3"
						:autosize="{ minRows: 3, maxRows: 3 }"
						@input="handleInput"
						@focus="handleFocus"
						@blur="handleBlur"
						@keypress="handleEnter"
						style="--n-border-hover: #e6f4ff; --n-border-focus: #e6f4ff; --n-box-shadow-focus: 0 0 0 2px rgba(24, 144, 255, 0.2);"

					>
						<!-- 添加右下角发送按钮 -->
						<div class="absolute-send-btn" @click="handleSubmit" v-if="!isMobile">
							<NButton circle size="small" type="primary">
								<template #icon>
									<SvgIcon icon="ri:send-plane-fill" />
								</template>
							</NButton>
						</div>
						<!-- 移动端前缀按钮 -->
						<template #prefix v-if="isMobile">
							<div class="mobile-prefix">
								<n-tooltip trigger="hover">
									<template #trigger>
										<SvgIcon
											v-if="st.isLoad == 1"
											icon="line-md:uploading-loop"
											class="mobile-icon"
										/>
										<SvgIcon
											v-else
											icon="ri:attachment-line"
											class="mobile-icon"
											@click="fsRef.click()"
										/>
									</template>
									<div
										v-if="canVisionModel(gptConfigStore.myData.model)"
										v-html="$t('mj.upPdf')"
									></div>
									<div v-else v-html="$t('mj.upImg')"></div>
								</n-tooltip>
							</div>

							<!-- 移动端语音按钮 -->
							<n-dropdown
								trigger="hover"
								:options="drOption"
								@select="handleSelectASR"
							>
								<div class="mobile-prefix">
									<div class="mobile-mic-indicator" v-if="st.micStart">
										<span class="ping-animation"></span>
									</div>
									<SvgIcon icon="bi:mic" class="mobile-icon" />
								</div>
							</n-dropdown>
						</template>

						<!-- 移动端后缀按钮 (发送) -->
						<template #suffix v-if="isMobile">
							<div class="mobile-send-button">
								<NButton
									type="primary"
									:disabled="disabled || homeStore.myData.isLoader"
									@click="handleSubmit"
								>
									<template #icon>
                    <span class="dark:text-black">
                      <SvgIcon
												icon="ri:stop-circle-line"
												v-if="homeStore.myData.isLoader"
											/>
                      <SvgIcon icon="ri:send-plane-fill" v-else />
                    </span>
									</template>
								</NButton>
							</div>

						</template>

					</NInput>
				</template>
			</NAutoComplete>
			<!-- 添加右下角发送按钮 -->
			<div class="absolute-send-btn" @click="handleSubmit" v-if="!isMobile">
				<NButton block size="small" type="info" >
					<template #icon>
						<SvgIcon icon="ri:send-plane-fill" />
					</template>
				</NButton>
			</div>
		</div>
	</div>

	<!-- 模型选择模态框 -->
	<NModal
		v-model:show="st.isShow"
		preset="card"
		:title="$t('mjchat.modelChange')"
		class="!max-w-[620px]"
		@close="st.isShow = false"
	>
		<aiModel @close="st.isShow = false" />
	</NModal>

</template>

<style scoped>
/* 容器基本样式 */
.chat-container {
	@apply relative rounded-lg transition-all duration-200;
}
/* 桌面版聊天容器 */
.desktop-chat {
	@apply border border-gray-100 bg-white shadow-sm hover:shadow-md mb-10; /* 添加了mb-4 */
}

/* 顶部工具栏 */
.chat-toolbar {
	@apply flex items-center justify-between p-3 border-b border-gray-100;
}

.toolbar-left {
	@apply flex items-center space-x-3;
}

.toolbar-right {
	@apply flex items-center;
}

/* 模型选择器 */
.model-selector {
	@apply flex items-center space-x-2 py-1.5 px-3 bg-blue-50 text-blue-600 rounded-md cursor-pointer transition-colors hover:bg-blue-100;
}

.model-icon {
	@apply text-blue-500;
}

.model-name {
	@apply font-medium text-sm line-clamp-1 overflow-hidden;
}

.model-arrow {
	@apply text-blue-400 text-sm ml-1;
}

.knowledge-base {
	@apply text-gray-500 text-sm ml-1;
}

/* 工具栏按钮 */
.toolbar-button {
	@apply w-9 h-9 flex items-center justify-center rounded-md hover:bg-gray-100 cursor-pointer relative transition-colors;
}

/* 语音按钮样式 */
.voice-button {
	@apply relative;
}

.mic-indicator {
	@apply absolute -top-1 -right-1;
}

.ping-animation {
	@apply relative flex h-3 w-3;
}

.ping-animation::before {
	content: '';
	@apply absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping;
}

.ping-animation::after {
	content: '';
	@apply relative inline-flex rounded-full h-3 w-3 bg-red-400;
}

/* 上传中图标 */
.loading-icon {
	@apply text-blue-500 animate-spin;
}

/* 移动端样式 */
.mobile-prefix {
	@apply relative w-[22px];
}

.mobile-icon {
	@apply absolute bottom-[10px] left-[8px] cursor-pointer;
}

.mobile-mic-indicator {
	@apply absolute bottom-[14px] left-[31px];
}

.mobile-send-button {
	@apply relative w-[40px];
}

.mobile-send-button > :deep(.n-button) {
	@apply absolute bottom-[-3px] right-[0px];
}

/* 附件预览覆盖样式 */
:deep(.n-image) {
	@apply w-full h-full;
}

/* 模态框样式 */
.model-modal {
	@apply !max-w-[620px];
}

/* 右下角发送按钮样式 - 新增 */
.absolute-send-btn {
	position: absolute !important;
	bottom: 10px !important;
	right: 10px !important;
	z-index: 999 !important;
}

/* 输入框焦点和悬停状态样式 - 新增 */
:deep(.n-input:hover .n-input__border),
:deep(.n-input-wrapper:hover .n-input__border) {
	border-color: #e6f4ff !important;
}

:deep(.n-input:focus-within .n-input__border),
:deep(.n-input--focus .n-input__border) {
	border-color: #e6f4ff !important;
	box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
}
</style>

<style>
/* 全局样式 */
.myinputs .n-input .n-input-wrapper {
	@apply items-stretch;
}

/* 覆盖naive-ui的原生输入框样式 */
.n-input:hover .n-input__border,
.n-input:focus .n-input__border,
.n-input:focus-within .n-input__border {
	border-color: #e6f4ff !important;
}

.n-input:focus-within {
	box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
}
</style>
