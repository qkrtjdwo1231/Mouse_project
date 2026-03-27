import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingCart, 
  User, 
  ArrowRight, 
  Heart, 
  Mouse, 
  Camera, 
  Sparkles, 
  Palette, 
  Layers, 
  Settings, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Cpu,
  FileText,
  Loader2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stage, PerspectiveCamera, Environment, MeshDistortMaterial, Float } from '@react-three/drei';
import * as THREE from 'three';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { MOUSE_BUILDS, MouseBuild } from './types';

type ChatMessage = { type: 'ai' | 'user', text: string, image?: string };

type HiddenMouseJson = {
  scale_x: number;
  scale_y: number;
  scale_z: number;
  color: string;
  texture: 'matte' | 'glossy' | 'grip';
  analysisSummary: string;
};

const COLOR_KEYWORDS: Record<string, string> = {
  블랙: '#111111',
  검정: '#111111',
  화이트: '#f7f7f7',
  흰색: '#f7f7f7',
  레드: '#c62828',
  빨강: '#c62828',
  블루: '#1f4aa8',
  파랑: '#1f4aa8',
  그린: '#2e7d32',
  초록: '#2e7d32',
  민트: '#7ae7e7',
  핑크: '#d575ff'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const inferColorFromText = (text: string): string | null => {
  const lowered = text.toLowerCase();
  if (lowered.includes('#') && /#[0-9a-f]{6}/i.test(lowered)) {
    return lowered.match(/#[0-9a-f]{6}/i)?.[0] ?? null;
  }
  const entry = Object.entries(COLOR_KEYWORDS).find(([keyword]) => text.includes(keyword));
  return entry ? entry[1] : null;
};

const inferTextureFromText = (text: string): HiddenMouseJson['texture'] => {
  if (text.includes('글로시') || text.includes('유광')) return 'glossy';
  if (text.includes('그립')) return 'grip';
  return 'matte';
};

const inferScaleYFromText = (text: string): number => {
  if (text.includes('더 높') || text.includes('높은') || text.includes('하이 아치')) return 1.22;
  if (text.includes('낮') || text.includes('로우 아치')) return 0.94;
  return 1.08;
};

const buildLocalResponse = (
  messages: ChatMessage[],
  handData: { length: number, width: number } | null
) => {
  const userMessages = messages.filter((m) => m.type === 'user');
  const latestUser = userMessages[userMessages.length - 1];
  const allUserText = userMessages.map((m) => m.text).join(' ');
  const hasImage = userMessages.some((m) => Boolean(m.image));

  const inferredColor = inferColorFromText(allUserText) ?? '#111111';
  const inferredTexture = inferTextureFromText(allUserText);
  const inferredScaleY = inferScaleYFromText(allUserText);

  const palmFactor = handData ? clamp(handData.width / Math.max(handData.length, 1), 0.45, 0.62) : 0.53;
  const scaleX = Number((1 + (palmFactor - 0.5) * 0.2).toFixed(2));
  const scaleY = Number(inferredScaleY.toFixed(2));
  const scaleZ = Number((1.02 + (hasImage ? 0.02 : 0)).toFixed(2));

  const hiddenPayload: HiddenMouseJson = {
    scale_x: scaleX,
    scale_y: scaleY,
    scale_z: scaleZ,
    color: inferredColor,
    texture: inferredTexture,
    analysisSummary: '손바닥 지지축과 손가락 레버리지 밸런스를 기준으로 장시간 사용 시 피로도를 낮추는 인체공학 프로파일로 설계되었습니다.'
  };

  const preferenceHint =
    latestUser?.text.includes('아치') ||
    latestUser?.text.includes('색') ||
    latestUser?.text.includes('블랙') ||
    latestUser?.text.includes('화이트');

  let visibleText = '';
  if (!hasImage && !preferenceHint) {
    visibleText =
      '수석 디자인 엔지니어가 접수했습니다. 손 사진 1장을 업로드해 주시면 골격 축과 파지 포인트를 기반으로 맞춤형 하우징 방향을 제안드리겠습니다.';
  } else if (!preferenceHint) {
    visibleText =
      '이미지 분석이 완료되었습니다. 클릭 레버 제어에 유리한 핑거 컨트롤 축이 뚜렷하고, 손목 부담을 낮추는 인체공학 쉘이 권장됩니다. 이제 선호하시는 아치 높이와 메인 색상을 말씀해 주세요.';
  } else {
    visibleText =
      '요청하신 취향을 반영해 커스텀 설계를 확정했습니다. 그립 중심 안정성과 클릭 반응 균형을 유지하도록 구조를 조정했으며, 바로 3D 시각화에 반영하겠습니다.';
  }

  return `${visibleText}\n\n---JSON_START---\n${JSON.stringify(hiddenPayload, null, 2)}\n---JSON_END---`;
};

const streamText = async (text: string, onChunk: (text: string) => void) => {
  let streamed = '';
  for (const ch of text) {
    streamed += ch;
    onChunk(streamed);
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  return streamed;
};

// --- API Helper ---
const chatWithAIStream = async (
  messages: ChatMessage[],
  handData: { length: number, width: number } | null,
  selectedModel: string,
  onChunk: (text: string) => void
) => {
  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    const localReply = buildLocalResponse(messages, handData);
    return streamText(localReply, onChunk);
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = selectedModel || 'gemini-3.1-flash-lite-preview';
  const systemInstruction = `
당신은 GRAVITY의 수석 디자인 엔지니어입니다.
규칙:
1) 사용자에게 숫자(mm/배율)를 노출하지 않습니다.
2) 전문적인 디자인/인체공학 용어로 설명합니다.
3) 분석 직후 반드시 아치 높이와 메인 색상을 질문합니다.
4) 답변 마지막에는 아래 JSON 블록을 반드시 포함합니다.
---JSON_START---
{
  "scale_x": number,
  "scale_y": number,
  "scale_z": number,
  "color": "hex",
  "texture": "matte|glossy|grip",
  "analysisSummary": "string"
}
---JSON_END---
손 데이터 참고: ${handData?.length || 180} x ${handData?.width || 90}
`;

  const contents = messages.map((msg) => {
    const parts: any[] = [{ text: msg.text }];
    if (msg.image) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: msg.image
        }
      });
    }
    return { role: msg.type === 'ai' ? 'model' : 'user', parts };
  });

  try {
    const result = await ai.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction }
    });

    let fullText = '';
    for await (const chunk of result) {
      const text = chunk.text || '';
      fullText += text;
      onChunk(fullText);
    }
    return fullText;
  } catch (error) {
    console.error('API Error:', error);
    const localReply = buildLocalResponse(messages, handData);
    return streamText(localReply, onChunk);
  }
};
// --- Utils ---
const compressImage = (base64Str: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Image compression timeout")), 10000);
    const img = new Image();
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Image compression failed: load error"));
    };
    img.src = base64Str;
  });
};

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("App Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle size={48} className="text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">臾몄젣媛 諛쒖깮?덉뒿?덈떎.</h1>
          <p className="text-outline mb-6">?좏뵆由ъ??댁뀡???ㅼ떆 濡쒕뱶??二쇱꽭??</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-primary text-surface rounded-lg font-bold">?덈줈怨좎묠</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Configurator Components ---

const ChatStep = ({ onAnalysisComplete }: { onAnalysisComplete: (result: any) => void }) => {
  const [messages, setMessages] = useState<{ id: number, type: 'ai' | 'user', text: string, image?: string }[]>([
    { id: 1, type: 'ai', text: 'GRAVITY 수석 디자인 엔지니어입니다. 손 사진 기반으로 맞춤형 마우스 설계를 도와드리겠습니다.' },
    { id: 2, type: 'ai', text: '손 사진을 올려주시거나 선호 아치/색상을 알려주세요. 분석 후 바로 3D 커스텀 파라미터로 연결합니다.' }
  ]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputText.trim() && !selectedImage) return;

    let compressedImage = undefined;
    if (selectedImage) {
      try {
        compressedImage = await compressImage(selectedImage, 800);
      } catch (e) {
        console.error("Compression failed", e);
        compressedImage = selectedImage;
      }
    }

    const userMsg = { 
      id: Date.now(), 
      type: 'user' as const, 
      text: inputText || (selectedImage ? "손 사진 분석 부탁해요." : ""),
      image: compressedImage ? compressedImage.split(',')[1] : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setSelectedImage(null);
    setIsAnalyzing(true);
    setError(null);

    const aiMsgId = Date.now() + 1;
    setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', text: '' }]);

    try {
      const history = [...messages, userMsg].map(m => ({ type: m.type, text: m.text, image: m.image }));
      
      const finalResponse = await chatWithAIStream(
        history, 
        null, 
        selectedModel,
        (streamedText) => {
          const cleanText = streamedText.split('---JSON_START---')[0].trim();
          setMessages(prev => prev.map(m => 
            m.id === aiMsgId ? { ...m, text: cleanText } : m
          ));
        }
      );
      
      const jsonMatch = finalResponse.match(/---JSON_START---([\s\S]*?)---JSON_END---/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[1]);
          setTimeout(() => onAnalysisComplete(result), 2000);
        } catch (e) {
          console.error("JSON Parse Error", e);
        }
      }
    } catch (err) {
      setError("AI 응답 처리 중 오류가 발생했습니다.");
      setMessages(prev => prev.filter(m => m.id !== aiMsgId));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            const compressed = await compressImage(base64, 800);
            setSelectedImage(compressed);
          } catch (err) {
            console.error("Compression error:", err);
            setError("이미지 처리 중 오류가 발생했습니다.");
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error("File read error:", err);
        setError("파일을 읽는 중 오류가 발생했습니다.");
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto h-[700px] bg-surface-container rounded-3xl border border-outline-variant/10 flex flex-col overflow-hidden shadow-2xl"
    >
      <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-high">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-headline font-bold text-sm tracking-tight">GRAVITY AI 디자이너</h3>
            <p className="text-[10px] text-primary font-label tracking-widest uppercase">실시간 컨설팅 모드</p>
          </div>
        </div>
        <select 
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="bg-surface-container-highest border border-outline-variant/30 rounded-full px-3 py-1 text-[10px] font-bold text-primary outline-none focus:border-primary transition-all"
        >
          <option value="gemini-3.1-flash-lite-preview">Flash Lite (異붿쿇)</option>
          <option value="gemini-1.5-flash">1.5 Flash</option>
          <option value="gemini-2.0-flash">2.0 Flash</option>
          <option value="gemini-3.1-pro-preview">Pro (怨좎꽦??</option>
        </select>
      </div>

      <div className="flex-grow p-8 overflow-y-auto space-y-6 scrollbar-hide">
        {messages.map((msg) => (
          <motion.div 
            key={msg.id}
            initial={{ opacity: 0, x: msg.type === 'ai' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex ${msg.type === 'ai' ? 'justify-start' : 'justify-end'}`}
          >
            <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${
              msg.type === 'ai' ? 'bg-surface-container-highest text-on-surface' : 'bg-primary text-surface font-medium'
            }`}>
              {msg.text}
              {msg.image && (
                <img src={`data:image/jpeg;base64,${msg.image}`} className="mt-3 rounded-lg max-w-full h-auto border border-white/10" alt="Uploaded" />
              )}
            </div>
          </motion.div>
        ))}
        {isAnalyzing && (
          <div className="flex justify-start">
            <div className="bg-surface-container-highest p-4 rounded-2xl flex gap-1">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-center p-4 bg-red-500/10 text-red-500 rounded-xl text-xs gap-2 items-center">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-6 bg-surface-container-high border-t border-outline-variant/10 space-y-4">
        {selectedImage && (
          <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-primary shadow-lg">
            <img src={selectedImage} className="w-full h-full object-cover" alt="Preview" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-0 right-0 bg-black/50 text-white p-1 hover:bg-red-500 transition-colors"
            >
              <AlertCircle size={12} />
            </button>
          </div>
        )}
        
        <div className="flex gap-3">
          <label className="flex items-center justify-center w-12 h-12 bg-surface-container-highest text-outline hover:text-primary border border-outline-variant/20 rounded-xl cursor-pointer transition-all">
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" />
            <Camera size={20} />
          </label>
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="아치 높이, 색상, 그립 취향을 입력해 주세요."
            className="flex-grow bg-surface-container-highest border border-outline-variant/20 rounded-xl px-6 text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <button 
            onClick={handleSendMessage}
            disabled={isAnalyzing || (!inputText.trim() && !selectedImage)}
            className="w-12 h-12 bg-primary text-surface rounded-xl flex items-center justify-center hover:shadow-[0_0_20px_rgba(161,250,255,0.4)] transition-all disabled:opacity-50"
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
const DesignStep = ({ design, setDesign, onNext }: { design: any, setDesign: any, onNext: () => void }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => (prev < 100 ? prev + 1 : 100));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="grid grid-cols-[1fr_450px] gap-12 h-full"
    >
      <div className="bg-surface-container rounded-3xl border border-outline-variant/10 p-12 flex flex-col justify-center items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-surface-container-highest">
          <motion.div 
            className="h-full bg-primary shadow-[0_0_10px_rgba(161,250,255,1)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="text-center mb-12">
          <h2 className="font-headline text-4xl font-black tracking-tighter mb-4 italic text-primary uppercase">遺꾩꽍 諛??ㅺ퀎 吏꾪뻾 以?..</h2>
          <p className="text-on-surface-variant">AI媛 理쒖쟻??洹쒓꺽???곗텧?섎뒗 ?숈븞, 洹?섏쓽 痍⑦뼢??留욌뒗 ?ㅽ??쇱쓣 而ㅼ뒪?곕쭏?댁쭠??蹂댁떗?쒖삤.</p>
        </div>

        <div className="relative w-full max-w-md aspect-square">
          <div className="absolute inset-0 bg-primary/5 rounded-full blur-[100px] animate-pulse" />
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzfzAeJH8-fHUohA4bkvzLNT3FG_PRAMe2XyELCMgoLf4DgE4LgOwL948PAEroQSS2qkDBy0OgGDhbj18A27kb2qt4XmgcOp3PrLoYeEelFJfRm2uU1jGiMIhhxqSM6kd-sLai7ZRDuFOOVEci4kevh8UG2oPvBtP2ZR6rOtD5c-UTElDMd5Bl8O9I9Y53oAH3JY_OgN2bCBy1MCAscWpoqfXxdkGEBPs6m86bO2voFZMjkI58oBIjebsq_orMpPjKGrdEaOUGO-rR"
            className="w-full h-full object-contain relative z-10 drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            style={{ filter: `drop-shadow(0 0 15px ${design.color}66)` }}
            alt="Mouse Preview"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="bg-surface-container-high p-8 rounded-3xl border border-outline-variant/10 space-y-8">
          <div>
            <h3 className="font-label text-xs tracking-[0.2em] text-primary uppercase font-bold mb-6 flex items-center gap-2">
              <Palette size={16} /> ?됱긽 ?좏깮
            </h3>
            <div className="flex gap-4">
              {['#a1faff', '#d575ff', '#ff7575', '#75ff8a', '#ffffff'].map((c) => (
                <button 
                  key={c}
                  onClick={() => setDesign({...design, color: c})}
                  className={`w-10 h-10 rounded-full border-2 transition-all hover:scale-110 ${design.color === c ? 'border-primary shadow-[0_0_10px_rgba(161,250,255,0.5)]' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-label text-xs tracking-[0.2em] text-primary uppercase font-bold mb-6 flex items-center gap-2">
              <Layers size={16} /> ?쒕㈃ 吏덇컧
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {['留ㅽ듃(Matte)', '湲濡쒖떆(Glossy)', '洹몃┰(Grip)'].map((t) => (
                <button 
                  key={t}
                  onClick={() => setDesign({...design, texture: t})}
                  className={`py-3 text-[10px] font-bold border transition-all rounded-lg ${design.texture === t ? 'bg-primary text-surface border-primary' : 'border-outline-variant text-outline hover:border-on-surface'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-label text-xs tracking-[0.2em] text-primary uppercase font-bold mb-6 flex items-center gap-2">
              <Settings size={16} /> ?섏슦吏??뺥깭
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {['鍮꾨?移?Ergo)', '?移?Ambi)'].map((s) => (
                <button 
                  key={s}
                  onClick={() => setDesign({...design, shape: s})}
                  className={`py-4 text-[10px] font-bold border transition-all rounded-lg ${design.shape === s ? 'bg-primary text-surface border-primary' : 'border-outline-variant text-outline hover:border-on-surface'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button 
          onClick={onNext}
          disabled={progress < 100}
          className={`w-full py-5 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 ${
            progress === 100 ? 'bg-primary text-surface hover:shadow-[0_0_30px_rgba(161,250,255,0.4)]' : 'bg-surface-container-highest text-outline cursor-not-allowed'
          }`}
        >
          {progress < 100 ? `遺꾩꽍 以?.. ${progress}%` : <>?붿옄???뺤젙 諛?寃곌낵 蹂닿린 <ChevronRight size={16} /></>}
        </button>
      </div>
    </motion.div>
  );
};

// --- 3D Mouse Model Component ---
const Mouse3D = ({ analysis, design }: { analysis: any, design: any }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const scaleX = analysis?.scale_x || 1.0;
  const scaleY = analysis?.scale_y || 1.0;
  const scaleZ = analysis?.scale_z || 1.0;
  const color = analysis?.color || design.color;

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.4}>
      <group ref={groupRef} scale={[scaleX, scaleY, scaleZ]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Inner Core (Solid) */}
        <mesh position={[0, 0, 0]}>
          <capsuleGeometry args={[0.45, 0.8, 32, 32]} />
          <meshStandardMaterial 
            color={color} 
            transparent 
            opacity={0.15} 
            roughness={1}
          />
        </mesh>

        {/* 3D Printed Honeycomb/Lattice Shell */}
        <mesh castShadow receiveShadow>
          <capsuleGeometry args={[0.5, 0.8, 16, 16]} />
          <meshStandardMaterial 
            color={color} 
            wireframe 
            wireframeLinewidth={2}
            emissive={color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.8}
          />
        </mesh>

        {/* Ergonomic Top Cover (Solid Accents) */}
        <mesh position={[0.2, 0.35, 0]} scale={[1.2, 0.2, 0.9]}>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial 
            color={color} 
            roughness={design.texture === '留ㅽ듃(Matte)' ? 0.9 : 0.1}
            metalness={0.2}
          />
        </mesh>

        {/* Split Click Buttons */}
        <group position={[0.6, 0.25, 0]}>
          <mesh position={[0, 0, 0.22]} rotation={[0, 0, -0.15]}>
            <boxGeometry args={[0.7, 0.05, 0.35]} />
            <meshStandardMaterial color={design.color} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.22]} rotation={[0, 0, -0.15]}>
            <boxGeometry args={[0.7, 0.05, 0.35]} />
            <meshStandardMaterial color={design.color} roughness={0.4} />
          </mesh>
        </group>

        {/* Precision Scroll Wheel */}
        <mesh position={[0.75, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.03, 16, 32]} />
          <meshStandardMaterial color="#111" roughness={0.2} metalness={0.8} />
        </mesh>

        {/* Internal Components Glow */}
        <pointLight position={[0, 0, 0]} color={design.color} intensity={1} distance={2} />
      </group>
      
      {/* Parametric Scan Ring (Blender Connection Visualization) */}
      <group position={[0, -0.8, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 1.45, 64]} />
          <meshBasicMaterial color={design.color} transparent opacity={0.4} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[1.2, 1.22, 64]} />
          <meshBasicMaterial color={design.color} transparent opacity={0.2} />
        </mesh>
      </group>
    </Float>
  );
};

const ResultStep = ({ design, analysis, onReset }: { design: any, analysis: any, onReset: () => void }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-surface-container rounded-3xl border border-outline-variant/10 p-16 grid grid-cols-2 gap-16 items-center h-full"
    >
      <div className="relative h-full min-h-[500px] bg-black/20 rounded-3xl overflow-hidden border border-outline-variant/5">
        <div className="absolute top-6 left-6 z-10">
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/20 rounded-full border border-primary/30">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">REAL-TIME 3D RENDER</span>
          </div>
        </div>
        
        <Canvas shadows dpr={[1, 2]}>
          <PerspectiveCamera makeDefault position={[0, 2, 5]} fov={40} />
          <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={8} />
          
          <Stage intensity={0.5} environment="city" adjustCamera={false}>
            <Mouse3D analysis={analysis} design={design} />
          </Stage>
          
          <Environment preset="city" />
          <gridHelper args={[10, 10, 0x333333, 0x111111]} position={[0, -1, 0]} />
        </Canvas>
        
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-outline uppercase tracking-[0.3em] font-bold opacity-50">
          Drag to Rotate ??Scroll to Zoom
        </div>
      </div>

      <div className="space-y-10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-px w-8 bg-primary" />
            <span className="font-label text-[10px] tracking-widest text-primary uppercase font-bold">?ㅺ퀎 ?꾨즺</span>
          </div>
          <h2 className="font-headline text-5xl font-black tracking-tighter mb-4 italic">GRAVITY CUSTOM <span className="text-primary">X-1</span></h2>
          <p className="text-on-surface-variant leading-relaxed">
            {analysis?.analysisSummary || "?뱀떊?????ъ쭊 遺꾩꽍 寃곌낵? ?좏깮?섏떊 ?ㅽ??쇱쓣 諛뷀깢?쇰줈 理쒖쟻??留덉슦?ㅺ? ?ㅺ퀎?섏뿀?듬땲?? 3D ?곸링 ?쒖“ 怨듬쾿???듯빐 0.01mm ?ㅼ감 ?녿뒗 ?꾨꼍??洹몃┰媛먯쓣 ?좎궗?⑸땲??"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {[
            { label: '湲몄씠 諛곗쑉', value: `${analysis?.scale_z || 1.0}x` },
            { label: '?덈퉬 諛곗쑉', value: `${analysis?.scale_x || 1.0}x` },
            { label: '?믪씠 諛곗쑉', value: `${analysis?.scale_y || 1.0}x` },
            { label: '?됱긽', value: analysis?.color || design.color },
            { label: '?쒕㈃', value: design.texture },
            { label: '?뺥깭', value: design.shape }
          ].map((spec) => (
            <div key={spec.label} className="bg-surface-container-high p-4 rounded-xl border border-outline-variant/5">
              <p className="font-label text-[8px] tracking-widest text-outline uppercase mb-1">{spec.label}</p>
              <p className="font-headline font-bold text-sm">{spec.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <button className="flex-grow py-5 bg-primary text-surface font-bold uppercase tracking-widest text-xs rounded-2xl shadow-xl hover:shadow-[0_0_30px_rgba(161,250,255,0.4)] transition-all">
            二쇰Ц 諛??쒖옉 ?쒖옉?섍린
          </button>
          <button 
            onClick={onReset}
            className="px-8 py-5 border border-outline-variant text-outline font-bold uppercase tracking-widest text-xs rounded-2xl hover:text-on-surface hover:border-on-surface transition-all"
          >
            ?ㅼ떆 ?ㅺ퀎?섍린
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const Configurator = ({ onBack }: { onBack: () => void }) => {
  const [step, setStep] = useState(1);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [design, setDesign] = useState({
    color: '#a1faff',
    texture: '留ㅽ듃(Matte)',
    shape: '鍮꾨?移?Ergo)'
  });

  const handleAnalysisComplete = (result: any) => {
    setAnalysisResult(result);
    setStep(2);
  };

  return (
    <div className="min-h-screen bg-surface pt-24 pb-12 px-24 flex flex-col">
      <div className="max-w-6xl mx-auto w-full flex-grow flex flex-col">
        <header className="flex justify-between items-center mb-12">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-outline hover:text-primary transition-colors font-label text-xs tracking-widest uppercase"
          >
            <ChevronLeft size={16} /> ?쇱??댁뒪濡??뚯븘媛湲?          </button>
          
          <div className="flex gap-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  step === s ? 'bg-primary text-surface shadow-[0_0_15px_rgba(161,250,255,0.5)]' : 
                  step > s ? 'bg-primary/20 text-primary' : 'bg-surface-container-highest text-outline'
                }`}>
                  {step > s ? <CheckCircle2 size={16} /> : s}
                </div>
                {s < 3 && <div className={`w-12 h-px ${step > s ? 'bg-primary/50' : 'bg-outline-variant/30'}`} />}
              </div>
            ))}
          </div>
        </header>

        <main className="flex-grow relative">
          <AnimatePresence>
            {step === 1 && <ChatStep onAnalysisComplete={handleAnalysisComplete} />}
            {step === 2 && <DesignStep design={design} setDesign={setDesign} onNext={() => setStep(3)} />}
            {step === 3 && <ResultStep design={design} analysis={analysisResult} onReset={() => setStep(1)} />}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

const AILab = () => {
  return null; // Removed as requested
};

const ModelControl = () => {
  const [systemInstruction, setSystemInstruction] = useState('?뱀떊? ?뺣? ?몄껜怨듯븰 ?붿??덉뼱?낅땲?? ?ъ슜?먯쓽 ???ъ쭊??遺꾩꽍?섏뿬 理쒖쟻??留덉슦??洹쒓꺽???쒖븞?섏꽭??');
  const [testPrompt, setTestPrompt] = useState('');
  const [testMessages, setTestMessages] = useState<{ role: 'user' | 'model', text: string, image?: string }[]>([]);
  const [testImage, setTestImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string, data: string, type: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const testChatEndRef = useRef<HTMLDivElement>(null);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/model-config');
        if (response.ok) {
          const config = await response.json();
          if (config.systemInstruction) setSystemInstruction(config.systemInstruction);
          if (config.uploadedFiles) setUploadedFiles(config.uploadedFiles);
        }
      } catch (err) {
        console.error("Failed to load model config:", err);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    testChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [testMessages]);

  const saveConfig = async () => {
    setSaveStatus('saving');
    try {
      const response = await fetch('/api/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction, uploadedFiles })
      });
      if (response.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error("Failed to save model config:", err);
      setSaveStatus('error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        const isText = file.name.endsWith('.txt') || file.type === 'text/plain';
        
        reader.onloadend = () => {
          setUploadedFiles(prev => [...prev, { 
            name: file.name, 
            data: reader.result as string,
            type: isText ? 'text/plain' : file.type
          }]);
        };

        if (isText) {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const handleTestImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setTestImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const runModelTest = async () => {
    if (!testPrompt.trim() && !testImage) return;
    
    setIsProcessing(true);
    setError(null);

    const newUserMsg = { 
      role: 'user' as const, 
      text: testPrompt || (testImage ? "?대?吏瑜?遺꾩꽍?댁쨾." : ""), 
      image: testImage ? testImage.split(',')[1] : undefined 
    };
    
    const updatedMessages = [...testMessages, newUserMsg];
    setTestMessages(updatedMessages);
    setTestPrompt('');
    setTestImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      // Build contents from history
      const contents = updatedMessages.map(msg => {
        const parts: any[] = [{ text: msg.text }];
        if (msg.image) {
          parts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: msg.image
            }
          });
        }
        return { role: msg.role, parts };
      });

      // Add Knowledge Base context to the first message or as a separate system-like injection
      const knowledgeBaseParts: any[] = [];
      uploadedFiles.forEach(file => {
        if (file.type.startsWith('image/')) {
          knowledgeBaseParts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: file.data.split(',')[1]
            }
          });
        } else if (file.type === 'text/plain') {
          knowledgeBaseParts.push({
            text: `\n[李몄“ 吏???뚯씪: ${file.name}]\n${file.data}\n`
          });
        }
      });

      // Inject knowledge base into the current turn's prompt for context
      if (knowledgeBaseParts.length > 0) {
        const lastContent = contents[contents.length - 1];
        lastContent.parts = [...knowledgeBaseParts, ...lastContent.parts];
      }

      const result = await ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction }
      });

      const aiText = result.text || '?묐떟???놁뒿?덈떎.';
      setTestMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (err) {
      console.error(err);
      setError("紐⑤뜽 ?ㅽ뻾 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface pt-32 pb-12 px-24">
      <div className="max-w-7xl mx-auto grid grid-cols-[450px_1fr] gap-12 h-[calc(100vh-200px)]">
        {/* Configuration Panel */}
        <aside className="bg-surface-container rounded-3xl border border-outline-variant/10 p-10 flex flex-col gap-8 overflow-y-auto shadow-xl">
          <div>
            <h2 className="font-headline text-3xl font-black tracking-tighter italic mb-2 uppercase">MODEL <span className="text-primary">CONTROL</span></h2>
            <p className="text-[10px] text-outline font-label tracking-widest uppercase">테스트 지시사항 및 지식베이스 관리</p>
          </div>

          <div className="space-y-6 flex-grow">
            <div className="space-y-3">
              <label className="text-[11px] font-bold tracking-widest text-primary uppercase flex items-center gap-2">
                <Settings size={14} /> 湲곕낯 吏?쒖궗??(System Instruction)
              </label>
              <textarea 
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                placeholder="紐⑤뜽???섎Ⅴ?뚮굹? ?듭떖 洹쒖튃???낅젰?섏꽭??.."
                className="w-full h-40 bg-surface-container-highest border border-outline-variant/20 rounded-2xl p-5 text-sm leading-relaxed focus:outline-none focus:border-primary transition-all resize-none font-sans"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold tracking-widest text-primary uppercase flex items-center gap-2">
                <Layers size={14} /> 吏??踰좎씠???뚯씪 (Images/Text)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-outline-variant/20 bg-surface-container-highest flex items-center justify-center">
                    {file.type.startsWith('image/') ? (
                      <img src={file.data} className="w-full h-full object-cover" alt={file.name} />
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <FileText size={32} className="text-primary" />
                        <span className="text-[9px] font-bold text-outline truncate w-full px-2">{file.name}</span>
                      </div>
                    )}
                    <button 
                      onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold uppercase"
                    >
                      ??젣
                    </button>
                  </div>
                ))}
                <label className="aspect-square border-2 border-dashed border-outline-variant/30 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group">
                  <Camera size={24} className="text-outline group-hover:text-primary mb-2" />
                  <span className="text-[10px] font-bold text-outline group-hover:text-primary uppercase">?뚯씪 異붽?</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} multiple accept="image/*,.txt" />
                </label>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-outline-variant/10 space-y-3">
            <button 
              onClick={saveConfig}
              disabled={saveStatus === 'saving'}
              className={`w-full py-4 text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${
                saveStatus === 'success' 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : saveStatus === 'error'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-primary text-surface hover:shadow-[0_0_20px_rgba(161,250,255,0.3)]'
              }`}
            >
              {saveStatus === 'saving' ? '저장 중..' : saveStatus === 'success' ? '저장 완료' : saveStatus === 'error' ? '저장 실패' : '설정 영구 저장'}
            </button>
            <button 
              onClick={() => setTestMessages([])}
              className="w-full py-3 border border-outline-variant text-[10px] font-bold text-outline uppercase tracking-widest rounded-xl hover:text-on-surface hover:border-on-surface transition-all"
            >
              ?뚯뒪?????珥덇린??            </button>
          </div>
        </aside>

        {/* Output Console / Chat Test Area */}
        <main className="bg-surface-container-high rounded-3xl border border-outline-variant/10 flex flex-col overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-highest">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              <div>
                <h3 className="text-xs font-bold tracking-widest text-primary uppercase">CONVERSATIONAL TEST CONSOLE</h3>
                <p className="text-[10px] text-outline uppercase mt-0.5">Gemini 3 Flash Preview ??Interactive Mode</p>
              </div>
            </div>
          </div>

          <div className="flex-grow p-8 overflow-y-auto space-y-6 bg-[#0a0a0a] scrollbar-hide">
            {testMessages.length === 0 && !error && (
              <div className="h-full flex flex-col items-center justify-center text-outline/20 italic">
                <Cpu size={64} className="mb-6 opacity-10" />
                <p className="text-sm uppercase tracking-[0.3em]">Awaiting Interaction...</p>
              </div>
            )}
            
            {testMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user' ? 'bg-primary text-surface font-medium' : 'bg-surface-container-highest text-on-surface-variant font-mono'
                }`}>
                  {msg.image && (
                    <img src={`data:image/jpeg;base64,${msg.image}`} className="mb-4 rounded-lg border border-white/10 max-h-48" alt="Test Upload" />
                  )}
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-surface-container-highest p-4 rounded-2xl flex gap-1">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 text-red-400 p-4 bg-red-400/10 rounded-xl border border-red-400/20 text-xs">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <div ref={testChatEndRef} />
          </div>

          {/* Test Input Area */}
          <div className="p-6 bg-surface-container-highest border-t border-outline-variant/10 space-y-4">
            {testImage && (
              <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-primary">
                <img src={testImage} className="w-full h-full object-cover" alt="Test Preview" />
                <button 
                  onClick={() => setTestImage(null)}
                  className="absolute top-0 right-0 bg-black/50 text-white p-1"
                >
                  <AlertCircle size={10} />
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <label className="flex items-center justify-center w-12 h-12 bg-surface-container-high text-outline hover:text-primary border border-outline-variant/20 rounded-xl cursor-pointer transition-all">
                <input type="file" className="hidden" onChange={handleTestImageUpload} accept="image/*" />
                <Camera size={20} />
              </label>
              <input 
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runModelTest()}
                placeholder="?ъ슜???낆옣?먯꽌 紐⑤뜽???뚯뒪?명빐蹂댁꽭??.."
                className="flex-grow bg-surface-container-high border border-outline-variant/20 rounded-xl px-6 text-sm focus:outline-none focus:border-primary transition-colors"
              />
              <button 
                onClick={runModelTest}
                disabled={isProcessing || (!testPrompt.trim() && !testImage)}
                className="px-6 bg-primary text-surface font-bold uppercase tracking-widest text-[10px] rounded-xl hover:shadow-[0_0_20px_rgba(161,250,255,0.4)] transition-all disabled:opacity-50"
              >
                ?꾩넚
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// --- Main Components ---

const Header = ({ onNavigate, currentView }: { onNavigate: (view: string) => void, currentView: string }) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={`fixed top-0 w-full z-50 flex justify-between items-center px-24 h-20 transition-all duration-300 ${
        isScrolled ? 'bg-surface/90 backdrop-blur-md shadow-lg' : 'bg-transparent'
      }`}
    >
      <div 
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => onNavigate('showcase')}
      >
        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
          <Mouse className="text-surface" size={24} />
        </div>
        <span className="font-headline text-2xl font-black tracking-tighter italic">GRAVITY</span>
      </div>
      
      <nav className="flex items-center gap-12">
        {[
          { label: 'STUDIO', ko: '스튜디오', view: 'showcase' },
          { label: 'MODEL CONTROL', ko: '모델 컨트롤', view: 'modelControl' },
          { label: 'PERFORMANCE', ko: '퍼포먼스', view: 'showcase' },
          { label: 'SUPPORT', ko: '고객지원', view: 'showcase' }
        ].map((item) => (
          <button 
            key={item.label}
            onClick={() => onNavigate(item.view)}
            className={`font-headline tracking-tight uppercase text-sm transition-colors ${
              currentView === item.view ? 'text-primary border-b-2 border-primary pb-1' : 'text-outline hover:text-on-surface'
            }`}
          >
            {item.ko}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-6">
        <button className="text-on-surface hover:text-primary transition-colors">
          <ShoppingCart size={20} />
        </button>
        <button className="text-on-surface hover:text-primary transition-colors">
          <User size={20} />
        </button>
        <div className="h-4 w-px bg-outline-variant/30" />
        <button className="font-label text-[10px] font-bold tracking-widest text-primary uppercase border border-primary/20 px-4 py-2 hover:bg-primary/5 transition-colors">
          濡쒓렇??        </button>
      </div>
    </header>
  );
};

const Hero = ({ onStart }: { onStart: () => void }) => {
  return (
    <section className="relative h-[85vh] flex items-center overflow-hidden px-24">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/70 to-transparent z-10" />
        <img 
          className="w-full h-full object-cover grayscale opacity-40 scale-110"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuAM2RBWTKpXl-649NIeWPb5UkPHlJHUwSSI5a1SMc0Oq_2YNmfa514a1pA7b6hsq1quuXDLa0MPcNyGy2CeI61oQRiJF5Imobj9RyLhJ-MF6yHJDmzSsB0Rk0Ic6Lw17QsEi9-ENz34aAZxclVD2xKUZU4nExeGib2Go2trNaUVBeM870sImD23Ag1OXUcHvirpTjWreiCyEtik-p8lbRdys-5yjtDCSHlwl0qJG3MkAT2HTsTzLpbTm6CAPjPqNggn4wkiRjjV2ZvV"
          alt="Gravity Mouse Shell"
          referrerPolicy="no-referrer"
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-20 max-w-4xl"
      >
        <div className="flex items-center gap-4 mb-6">
          <span className="h-px w-12 bg-primary" />
          <span className="font-label text-xs tracking-[0.3em] text-primary uppercase font-bold">정밀 공학의 정점</span>
        </div>
        
        <h1 className="font-headline text-8xl font-black tracking-tighter leading-none mb-8">
          맞춤형 유저
          <br />
          <span className="text-primary-container">SHOWCASE</span>
        </h1>
        
        <p className="text-lg text-on-surface-variant max-w-xl leading-relaxed mb-10">
          손 사진으로 완성되는 나만의 마우스 경험. 비전 분석 기술과 3D 설계 공법을 통해 사용자 손에 최적화된 퍼포먼스를 제공합니다.
        </p>
        
        <motion.button 
          onClick={onStart}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-4 bg-gradient-to-r from-primary to-primary-container text-surface font-bold uppercase tracking-widest text-xs"
        >
          나만의 마우스 만들기
        </motion.button>
      </motion.div>
    </section>
  );
};

const StatsBar = () => {
  const [activeFilter, setActiveFilter] = useState('TRENDING');

  return (
    <section className="bg-surface-container py-6 px-24 flex justify-between items-center gap-8 border-y border-outline-variant/10">
      <div className="flex gap-10">
        <div className="flex flex-col">
          <span className="font-label text-[10px] tracking-widest text-outline uppercase mb-1">커뮤니티 빌드</span>
          <span className="font-headline text-xl font-bold">1,284</span>
        </div>
        <div className="flex flex-col">
          <span className="font-label text-[10px] tracking-widest text-outline uppercase mb-1">평균 무게</span>
          <span className="font-headline text-xl font-bold text-primary">39.5G</span>
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { label: 'TRENDING', ko: '트렌딩' },
          { label: 'ULTRALIGHT', ko: '초경량' },
          { label: 'PRO EDITIONS', ko: '프로 에디션' }
        ].map((filter) => (
          <button
            key={filter.label}
            onClick={() => setActiveFilter(filter.label)}
            className={`px-4 py-2 font-label text-xs font-bold tracking-widest transition-all ${
              activeFilter === filter.label 
                ? 'bg-surface-container-highest text-primary border border-primary/20' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {filter.ko}
          </button>
        ))}
      </div>
    </section>
  );
};

const BuildCard: React.FC<{ build: MouseBuild }> = ({ build }) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group relative bg-surface-container-high overflow-hidden flex flex-col h-full border-l-2 transition-all duration-300"
      style={{ borderColor: build.accentColor }}
    >
      <div className="relative aspect-square overflow-hidden bg-surface">
        <img 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
          src={build.imageUrl}
          alt={build.name}
          referrerPolicy="no-referrer"
        />
        <div className="absolute bottom-4 left-4 bg-surface/80 backdrop-blur px-3 py-1 font-label text-[10px] font-bold tracking-widest" style={{ color: build.accentColor }}>
          @{build.designer}
        </div>
      </div>

      <div className="p-8 flex flex-col flex-grow">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-headline text-2xl font-black tracking-tight uppercase">{build.name}</h3>
            <p className="font-label text-[10px] tracking-[0.2em] text-outline uppercase">{build.type}</p>
          </div>
          <div className="text-right">
            <span className="font-headline text-2xl font-light" style={{ color: build.accentColor }}>
              {build.weight}<span className="text-xs ml-1">G</span>
            </span>
          </div>
        </div>

        <p className="text-sm text-on-surface-variant mb-8 line-clamp-2">
          {build.description}
        </p>

        <div className="mt-auto pt-6 border-t border-outline-variant/10 flex justify-between items-center">
          <button className="font-label text-[10px] font-bold tracking-[0.2em] transition-colors flex items-center gap-2 hover:text-on-surface" style={{ color: build.accentColor }}>
            援ъ꽦 ?뺤씤?섍린 <ArrowRight size={14} />
          </button>
          <button className="text-outline hover:text-red-500 transition-colors">
            <Heart size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const SubmitCard = () => {
  return (
    <div className="col-span-2 relative bg-surface-container-highest flex flex-row items-center overflow-hidden">
      <div className="absolute top-0 right-0 p-4 font-label text-[8px] tracking-[0.4em] text-primary/30 uppercase vertical-text rotate-90 origin-top-right">
        연구용 모델 (EXPERIMENTAL)
      </div>
      
      <div className="p-12 w-1/2">
        <h2 className="font-headline text-4xl font-black tracking-tighter mb-6">당신의 빌드를 공유하세요</h2>
        <p className="text-on-surface-variant mb-8">
          최고의 유저 커뮤니티에 합류하세요. 커스텀 구성을 공유하고 GRAVITY 글로벌 갤러리에 이름을 올려보세요.
        </p>
        <button className="px-8 py-3 bg-on-surface text-surface font-bold uppercase tracking-widest text-xs transition-colors hover:bg-primary">
          사진 제출하기
        </button>
      </div>

      <div className="w-1/2 h-full relative overflow-hidden bg-surface-container min-h-[300px]">
        <img 
          className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-700"
          src="https://lh3.googleusercontent.com/aida/ADBb0ug_CinUVBpFmv7NcUXUJnPVj2Nl674ANPuU3AgNTHdwmplMZF7GrSn_DgwI-z-cBhRDhcatBLO2VPsB_PDG8WXvqikI_Wl_2cXLhfnihShXEyYb73iyuX9CA1U7DbXNr6VCO4srtNpk4efhU4tuU0s2L_CoxWzmgYp7jpas09cHg_uaV35fkLwcG6nC1NKrJEsymG2ddpvwOh2e0KxYAn8SlwQC_4h1gXoWmjp5q4FZmN9VgYd-1dSP7icdelxTh9AHX4LQDHe6Ww"
          alt="Engineer Lab"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-surface-container-highest" />
      </div>
    </div>
  );
};

const Footer = () => {
  return (
    <footer className="bg-black border-t border-white/5 py-16 px-8">
      <div className="max-w-7xl mx-auto flex flex-row justify-between items-center gap-12">
        <div className="text-primary font-black font-headline text-2xl tracking-tighter uppercase">
          GRAVITY
        </div>
        
        <div className="flex flex-wrap justify-center gap-8">
          {[
            { label: 'PRIVACY POLICY', ko: '媛쒖씤?뺣낫 泥섎━諛⑹묠' },
            { label: 'TERMS OF SERVICE', ko: '?댁슜?쎄?' },
            { label: 'WARRANTY', ko: '蹂댁쬆 ?뺤콉' },
            { label: 'CONTACT', ko: '臾몄쓽?섍린' }
          ].map((item) => (
            <a key={item.label} href="#" className="font-label text-[10px] tracking-[0.2em] uppercase text-outline hover:text-primary transition-colors">
              {item.ko}
            </a>
          ))}
        </div>

        <div className="font-label text-[10px] tracking-[0.2em] uppercase text-outline text-right">
          짤 2024 GRAVITY PRECISION KINETIC. 紐⑤뱺 沅뚮━ 蹂댁쑀.
        </div>
      </div>
    </footer>
  );
};

export default function App() {
  const [view, setView] = useState('showcase');

  return (
    <ErrorBoundary>
      <div className="min-h-screen selection:bg-primary/30 min-w-[1280px] bg-surface text-on-surface">
        <Header onNavigate={setView} currentView={view} />
        
        <AnimatePresence>
          {view === 'showcase' ? (
            <motion.main
              key="showcase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Hero onStart={() => setView('configurator')} />
              <StatsBar />
              
              <section className="px-24 py-24 max-w-7xl mx-auto">
                <div className="grid grid-cols-3 gap-12">
                  {MOUSE_BUILDS.map((build) => (
                    <BuildCard key={build.id} build={build} />
                  ))}
                  <SubmitCard />
                </div>
              </section>

              <section className="py-32 px-8 text-center bg-surface relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
                
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className="relative z-10"
                >
                  <h2 className="font-headline text-7xl font-black tracking-tighter mb-12 italic text-on-surface">
                    EVOLVE YOUR PLAY.
                  </h2>
                  
                  <div className="flex flex-row justify-center gap-6">
                    <motion.button 
                      onClick={() => setView('configurator')}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-12 py-5 bg-primary text-surface font-bold uppercase tracking-[0.2em] text-xs transition-all hover:shadow-[0_0_30px_rgba(161,250,255,0.4)]"
                    >
                      而ㅼ뒪? ?쒖옉?섍린
                    </motion.button>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-12 py-5 border border-outline-variant text-on-surface font-bold uppercase tracking-[0.2em] text-xs hover:bg-white/5 transition-colors"
                    >
                      ?ъ뼇 ?댄렣蹂닿린
                    </motion.button>
                  </div>
                </motion.div>
              </section>
            </motion.main>
          ) : view === 'configurator' ? (
            <motion.div
              key="configurator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Configurator onBack={() => setView('showcase')} />
            </motion.div>
          ) : view === 'modelControl' ? (
            <motion.div
              key="modelControl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <ModelControl />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}

