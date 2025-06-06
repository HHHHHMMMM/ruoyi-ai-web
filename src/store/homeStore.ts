import { gptsType, mlog } from '@/api';
import { reactive } from 'vue'
import { ss } from '@/utils/storage'

export const homeStore = reactive({
    myData:{
        act:'',//动作
        actData:{} //动作类别
        ,local:'' //当前所处的版本
        ,session:{} as any
        ,isLoader:false

    }

    ,setMyData( v:object){
        this.myData={...this.myData,...v};
        if( Object.keys(v).indexOf('act')>-1){
            setTimeout(()=> {
                this.myData.act=''
                this.myData.actData=''
            }, 2000 );
        }
    }

})

export interface gptConfigType{
    model:string
    modelLabel:string
    max_tokens:number
    userModel?:string //自定义
    talkCount:number //联系对话
    systemMessage:string //自定义系统提示语
    kid:string //知识库id
    kName:string //知识库名称
    gpts?:gptsType
    uuid?:number
    temperature?:number // 随机性 : 值越大，回复越随机
    top_p?:number // 核采样 : 与随机性类似，但不要和随机性一起更改
    frequency_penalty?:number
    presence_penalty?:number
    tts_voice?:string //TTS 人物
		enableKnowledgeGraph?: boolean;

}
const getGptInt= ():gptConfigType =>{
    let v:gptConfigType=getDefault();
    let str = localStorage.getItem('gptConfigStore');
    if(str){
        let old = JSON.parse(str);
        if(old) v={...v,...old};
    }
    return v;
}

const  getDefault=()=>{
const amodel = homeStore.myData.session.amodel??'gpt-4o-mini'
let v:gptConfigType={
    model: amodel,
    modelLabel: '',
    max_tokens: 1024,
    userModel: '',
    talkCount: 10,
    systemMessage: '',
    temperature: 0.5,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    tts_voice: "alloy",
    kid: '',
    kName: ''
}
    return v ;
}
export const gptConfigStore= reactive({
    myData:getGptInt(),
    setMyData(v: Partial<gptConfigType>){

         this.myData={...this.myData,...v};
         //mlog('gptConfigStore', v )
         if(v.model && !v.gpts) this.myData.gpts=undefined;

         localStorage.setItem('gptConfigStore', JSON.stringify( this.myData));
    }
    ,setInit(){
        this.setMyData(getDefault());
    }
})


export interface gptServerType{
    OPENAI_API_KEY:string
    OPENAI_API_BASE_URL:string
    MJ_SERVER:string
    MJ_API_SECRET:string
    UPLOADER_URL:string
    MJ_CDN_WSRV?:boolean //wsrv.nl

}

const  getServerDefault=()=>{
let v:gptServerType={
        OPENAI_API_KEY:'',
        OPENAI_API_BASE_URL:'',
        MJ_SERVER:'',
        UPLOADER_URL:'',
        MJ_API_SECRET:'',
        MJ_CDN_WSRV:false
    }
    return v ;
}
const getServerInit= ():gptServerType =>{
    let v:gptServerType=getServerDefault();
    let str = localStorage.getItem('gptServerStore');
    if(str){
        let old = JSON.parse(str);
        if(old) v={...v,...old};
    }
    return v;
}

export const gptServerStore= reactive({
    myData:getServerInit(),
    setMyData(v: Partial<gptServerType>){
         this.myData={...this.myData,...v};
         localStorage.setItem('gptServerStore', JSON.stringify( this.myData));
    }
    ,setInit(){
        this.setMyData(getServerDefault());
    }
})


const gptsUlistInit= ():gptsType[]=>{
    const lk= ss.get('gpts-use-list');
    if( !lk) return [];
    return lk as gptsType[];
}

//使用gtps列表
export const gptsUlistStore= reactive({
    myData:gptsUlistInit(),
    setMyData( v: gptsType){
        this.myData= this.myData.filter( v2=> v2.gid!=v.gid );
        this.myData.unshift(v);
        ss.set('gpts-use-list', this.myData );
        return this;
    }
});
