<script setup lang='ts'>
import { computed, ref, watch } from 'vue'
import { NDropdown, useMessage } from 'naive-ui'
import AvatarComponent from './Avatar.vue'
import TextComponent from './Text.vue'
import { SvgIcon } from '@/components/common'
import { useIconRender } from '@/hooks/useIconRender'
import { t } from '@/locales'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { copyToClip } from '@/utils/copy'
import { homeStore } from '@/store'
import { getSeed, mlog ,mjImgUrl} from '@/api' 

interface Props {
  dateTime?: string
  text?: string
  inversion?: boolean
  error?: boolean
  loading?: boolean
  chat:Chat.Chat
  index:number
}

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const { isMobile } = useBasicLayout()

const { iconRender } = useIconRender()

const message = useMessage()

const textRef = ref<HTMLElement>()

const asRawText = ref(props.inversion)

const messageRef = ref<HTMLElement>()

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
      icon: iconRender({ icon:'mdi:tts' }),
    })
  }

  return common
})

function handleSelect(key: 'copyText' | 'delete' | 'toggleRenderType' |'tts') {
  switch (key) {
    case 'tts': 
      homeStore.setMyData({act:'gpt.ttsv2', actData:{ index:props.index , uuid:props.chat.uuid, text:props.text } });
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

function handleRegenerate() {
  messageRef.value?.scrollIntoView()
  emit('regenerate')
}


async function handleCopy(txt?:string) {
  try {
    await copyToClip( txt|| props.text || '')
    message.success( t('chat.copied'))
  }
  catch {
    message.error( t('mj.copyFail') )
  }
}

const sendReload = () => {
  homeStore.setMyData({act:'mjReload', actData:{mjID:props.chat.mjID} })
}

function handleRegenerate2() {
  messageRef.value?.scrollIntoView()
  //emit('regenerate')
  mlog('重新发送！');
  homeStore.setMyData({act:'gpt.resubmit', actData:{ index:props.index , uuid:props.chat.uuid } });
}
 
// 新增内容分割逻辑
const splitContent = computed(() => {
  const content = props.text || ''
  const thinkStart = content.indexOf('<think>')
  const thinkEnd = content.indexOf('</think>')
  
  return {
    hasThink: thinkStart > -1 && thinkEnd > -1,
    think: thinkEnd > -1 ? content.slice(thinkStart + 7, thinkEnd) : '',
    response: thinkEnd > -1 ? content.slice(thinkEnd + 8) : content
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
  <div v-if="splitContent.hasThink" class="think-section">
    {{ splitContent.think }}
  </div>
  <div class="response-section">
    {{ splitContent.response }}
  </div>
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
  font-style: italic;
  color: #9CA3AF;
}

.response-divider {
  height: 1px;
  background: #374151;
  margin: 0 12px;
}

.response-section {
  padding: 12px;
  color: #E5E7EB;
  line-height: 1.5;
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
  border: 1px solid #374151;
  border-radius: 8px;
  background: #1F2937;
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
  color: #E5E7EB;
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