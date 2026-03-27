export interface MouseBuild {
  id: string;
  name: string;
  designer: string;
  type: string;
  weight: number;
  description: string;
  imageUrl: string;
  accentColor: string;
}

export const MOUSE_BUILDS: MouseBuild[] = [
  {
    id: '1',
    name: 'ORBITAL-7 PRO',
    designer: 'KEI_DESIGN',
    type: '3D 프린팅 나일론',
    weight: 45,
    description: '핑거팁 그립에 최적화된 설계. 질량을 최소화하면서도 구조적 무결성을 극대화하기 위해 커스텀 허니콤 구조를 적용했습니다.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAzfzAeJH8-fHUohA4bkvzLNT3FG_PRAMe2XyELCMgoLf4DgE4LgOwL948PAEroQSS2qkDBy0OgGDhbj18A27kb2qt4XmgcOp3PrLoYeEelFJfRm2uU1jGiMIhhxqSM6kd-sLai7ZRDuFOOVEci4kevh8UG2oPvBtP2ZR6rOtD5c-UTElDMd5Bl8O9I9Y53oAH3JY_OgN2bCBy1MCAscWpoqfXxdkGEBPs6m86bO2voFZMjkI58oBIjebsq_orMpPjKGrdEaOUGO-rR',
    accentColor: '#a1faff',
  },
  {
    id: '2',
    name: 'SPECTRE-X1',
    designer: 'VOID_WALKER',
    type: '헥스 래티스',
    weight: 38,
    description: '카본 파이버 복합 레진과 초박형 \'Spectre\' 쉘 기술이 적용된 미니멀리즘 프로토타입입니다.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBI43cVDq3aV7_IW4vEIB159CbK6yXoC6CJf-oJ0uGD9Y0eBRI8-8WKSU8L7WJAojWmzVGr4zKZcNbnEU4rAUcpRkMR2iI14HoFmO4_JlTIlAplWHPlllCNzKMQczxxySZVRmZbiWgDNQxSfpGzT87U6itYrXn7ptacM4e9Gzbu7RS9k5Jc7-KxKY7_Y4bsK37eQea6mLXo4GQGLFZ9k8fyrhbRr6DTEj1XN6Pw4GC2RQGO3hTeok-CZ7rlD4h79z_x5VajZTSgDoPa',
    accentColor: '#d575ff',
  },
  {
    id: '3',
    name: 'CORE CHASSIS',
    designer: 'CHASSIS_MASTER',
    type: '경량 스켈레톤',
    weight: 45,
    description: '클릭 레이턴시와 밸런스에 집중한 고성능 모델. 그래비티 모듈형 커스텀 시스템의 근간이 되는 제품입니다.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuANSLbw_jorvzR1T-NZGd38ntclt2YrSWPm4XfiySLd6Tcbl4JAlQLbNyeuZW_PXQsnd_pcrlMmItPWA7RuG5JIi3VV5a-ePfc-BliKqjUcliMgZP0MwHLF4bJ_L0NrohSqNm8vR6X9sxEM9aiRsGlUKwM08AhTJCp4b53II8TvbF50bNVDErKSRrHcB9-2m0kklYIsQce3t0XjNJ7I5x46kU6Zj8sx9IIXJ6EKMoNplqNWve_8xKMdlj55bQ20r8gRs6DVjVXUPNqg',
    accentColor: '#a1faff',
  },
  {
    id: '4',
    name: 'LATTICE SHELL V2',
    designer: 'LATTICE_LABS',
    type: '그래디언트 밀도',
    weight: 35,
    description: '경량화의 정점. 레진의 강도 대 중량비 한계를 뛰어넘은 구조적 걸작입니다.',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuApSqNe29BsuKv9vJYMo8tL7_yzWlWtCTHOTHENX-_Bgk37v2AEuDYv6hb0mtfkb3g1oPTZkL5cxYLFBwJLo2XFaTa15N34iPUiknDVsFJVMyv6maCO6Ky2i0kAfPIQ2S39JblX1Rsyc-VhO_QTv3DC17Fr6h3JKe079cvOStOyN_HQbP_IqpGP9Bz_P7tYW1izu8jei5qXnvvMVXgsUwBdgwk2uxgWj8WitIRPzWpBYfgRgCFdBVov5Px0wLz-5CMrcFv57Zt0H9dB',
    accentColor: '#a1faff',
  },
];
