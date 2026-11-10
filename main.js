import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

(() => {
  const $ = id => document.getElementById(id);
  if (!$("headline")) {
    const heading = document.createElement("span");
    heading.id = "headline";
    heading.className = "visually-hidden";
    document.body.appendChild(heading);
  }
  const quotes = [
    "작은 걸음도 멈추지 않으면 목적지에 닿아요.",
    "오늘의 집중은 내일의 나를 조금 더 단단하게 만들어요.",
    "완벽하지 않아도 괜찮아요. 해냈다는 사실이 중요해요.",
    "꾸준함은 재능보다 오래 멀리 데려다줘요.",
    "수고했어요. 이제 잠깐 마음도 쉬어가요.",
    "한 번의 집중이 모여 큰 변화를 만들어요."
  ];
  const state = {
    focus:25, rest:5, sets:4, completed:0, phase:"idle",
    remaining:1500, deadline:null, running:false, interval:null,
    focusNoise:false, breakNoise:false, focusSound:"cafe", breakSound:"rain",
    noiseNode:null, audio:null, wakeLock:null
  };
  const phaseDuration = () => (state.phase === "focus" ? state.focus : state.rest) * 60;
  const isActive = () => state.phase === "focus" || state.phase === "rest";
  const localDayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };

  const nativePlatform = Capacitor.isNativePlatform();
  const notificationIds = Array.from({length: 80}, (_,i)=>5000+i);
  async function ensureNativeNotificationPermission() {
    if (!nativePlatform) return false;
    try {
      let p = await LocalNotifications.checkPermissions();
      if (p.display !== "granted") p = await LocalNotifications.requestPermissions();
      if (p.display !== "granted") return false;
      if (Capacitor.getPlatform() === "android") {
        await LocalNotifications.createChannel({
          id: "blackpaw-timer", name: "BLACK PAW 타이머",
          description: "집중과 휴식 단계 전환 알림",
          importance: 5, visibility: 1, sound: "default", vibration: true
        });
      }
      return true;
    } catch (e) { return false; }
  }
  async function cancelNativeNotifications() {
    if (!nativePlatform) return;
    try { await LocalNotifications.cancel({notifications: notificationIds.map(id=>({id}))}); } catch(e) {}
  }
  async function scheduleNativeTransitions() {
    if (!nativePlatform || !state.running || !isActive()) return;
    const allowed = await ensureNativeNotificationPermission();
    if (!allowed) return;
    await cancelNativeNotifications();
    const notifications = [];
    let phase = state.phase;
    let remaining = state.remaining;
    let completed = state.completed;
    let at = Date.now();
    let idx = 0;
    while (idx < notificationIds.length) {
      at += Math.max(1, remaining) * 1000;
      if (phase === "focus") {
        notifications.push({
          id: notificationIds[idx++], title: "BLACK PAW · 휴식 시간",
          body: "집중 시간이 끝났어요. 잠깐 쉬어가요 🐈‍⬛",
          schedule: { at: new Date(at), allowWhileIdle: true },
          channelId: "blackpaw-timer", smallIcon: "ic_stat_icon_config_sample"
        });
        phase = "rest"; remaining = state.rest * 60;
      } else {
        completed++;
        if (completed >= state.sets) {
          notifications.push({
            id: notificationIds[idx++], title: "BLACK PAW · 오늘의 루틴 완료",
            body: "오늘도 정말 고생했어요! 멋지게 해냈어요 🎉",
            schedule: { at: new Date(at), allowWhileIdle: true },
            channelId: "blackpaw-timer", smallIcon: "ic_stat_icon_config_sample"
          });
          break;
        }
        notifications.push({
          id: notificationIds[idx++], title: "BLACK PAW · 집중 시간",
          body: "휴식이 끝났어요. 다시 집중해 볼까요?",
          schedule: { at: new Date(at), allowWhileIdle: true },
          channelId: "blackpaw-timer", smallIcon: "ic_stat_icon_config_sample"
        });
        phase = "focus"; remaining = state.focus * 60;
      }
    }
    if (notifications.length) {
      try { await LocalNotifications.schedule({notifications}); } catch(e) {}
    }
  }

  function render() {
    const active = isActive();
    const mins = Math.floor(Math.max(0,state.remaining)/60);
    const secs = Math.max(0,state.remaining)%60;
    $("timer").textContent = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    $("phasePill").innerHTML = `<span class="dot"></span> ${state.phase==="focus"?"집중 중":state.phase==="rest"?"휴식 중":"준비 완료"}`;
    $("headline").textContent = state.phase==="focus"?"지금은 나에게 집중!":state.phase==="rest"?"잠깐 쉬어가도 좋아요.":"오늘도 한 걸음씩.";
    $("substatus").textContent = state.phase==="focus"?"고양이와 함께 차근차근 해봐요.":state.phase==="rest"?"눈을 쉬고 가볍게 몸을 풀어요.":"집중할 준비가 되었나요?";
    $("startBtn").textContent = state.running ? "Ⅱ 일시정지" : active ? "▶ 계속하기" : "▶ 시작하기";
    $("skipBtn").disabled = !active;
    $("progressText").textContent = `${state.completed} / ${state.sets} 세트 완료`;
    $("setCounter").innerHTML = Array.from({length:state.sets},(_,i)=>
      `<span class="set-mark ${i<state.completed?"done":""}" aria-label="${i<state.completed?"완료":"미완료"}">${i<state.completed?"✓":"○"}</span>`
    ).join("");
    $("setCounter").setAttribute("aria-label", `${state.completed} / ${state.sets} 세트 완료`);
    $("startBtn").textContent = state.running ? "Ⅱ" : "▶";
    $("startBtn").setAttribute("aria-label", state.running ? "일시정지" : active ? "계속하기" : "시작");
    $("skipBtn").disabled = !active;
    $("catStage").classList.toggle("resting", state.phase==="rest");
    document.title = active ? `${$("timer").textContent} · BLACK PAW` : "BLACK PAW";
  }
  function save() {
    const data = {...state, localDate:localDayKey(), interval:null, audio:null, noiseNode:null, wakeLock:null};
    localStorage.setItem("blackpaw-state", JSON.stringify(data));
  }
  function notify(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(title,{body,icon:"icons/icon-192.png",tag:"blackpaw-phase"}); } catch(e) {}
    }
  }
  function beep(kind="transition") {
    if (!$("soundAlert").checked) return;
    try {
      const ctx = state.audio || (state.audio = new (window.AudioContext||window.webkitAudioContext)());
      if (ctx.state==="suspended") ctx.resume();
      const notes = kind==="finish" ? [523.25,659.25,783.99,1046.5] : [kind==="focus"?660:523, kind==="focus"?880:659];
      notes.forEach((f,i)=>{
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        osc.type="sine";osc.frequency.value=f;gain.gain.setValueAtTime(.0001,ctx.currentTime+i*.16);
        gain.gain.exponentialRampToValueAtTime(.13,ctx.currentTime+i*.16+.025);
        gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.16+.24);
        osc.connect(gain);gain.connect(ctx.destination);osc.start(ctx.currentTime+i*.16);osc.stop(ctx.currentTime+i*.16+.26);
      });
    } catch(e) {}
    if ($("vibration").checked) {
      if (nativePlatform) {
        Haptics.impact({style: kind==="finish" ? ImpactStyle.Heavy : ImpactStyle.Medium}).catch(()=>{});
      } else if (navigator.vibrate) navigator.vibrate(kind==="finish"?[180,70,180,70,350]:[120,60,120]);
    }
  }
  function stopNoise() {
    if (state.noiseNode) {
      try { state.noiseNode.forEach(n=>{try{n.stop();}catch(e){};try{n.disconnect();}catch(e){}}); } catch(e) {}
      state.noiseNode=null;
    }
    $("soundNote").textContent = "소리는 시작 버튼을 누른 뒤 재생됩니다.";
  }
  function makeNoiseBuffer(ctx, kind) {
    const seconds = 10, length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let smooth = 0;
    for (let i=0;i<length;i++) {
      const white = Math.random()*2-1;
      smooth = smooth*0.965 + white*0.035;
      let v = white;
      if (kind==="cafe") v = smooth*1.7 + white*0.10;
      if (kind==="rain") v = smooth*1.0 + white*0.30;
      if (kind==="fire") v = smooth*0.8 + white*0.06;
      if (kind==="plane") v = smooth*2.0 + white*0.035;
      data[i] = v*0.65;
    }
    // 자연스러운 반복감을 줄이기 위한 소리별 질감 요소
    if (kind==="rain" || kind==="fire" || kind==="cafe") {
      const count = kind==="fire" ? 65 : kind==="rain" ? 260 : 18;
      for(let k=0;k<count;k++){
        const pos=Math.floor(Math.random()*length);
        const amp=kind==="fire" ? (0.25+Math.random()*0.65) : kind==="rain" ? (0.08+Math.random()*0.24) : (0.025+Math.random()*0.09);
        const width=kind==="fire" ? 120+Math.floor(Math.random()*500) : kind==="rain" ? 80+Math.floor(Math.random()*400) : 100+Math.floor(Math.random()*250);
        for(let j=0;j<width && pos+j<length;j++){
          const decay=Math.exp(-j/(width/5));
          data[pos+j] += (Math.random()*2-1)*amp*decay;
        }
      }
    }
    // Seamless-ish loop: blend the final 0.4s into the beginning.
    const fade=Math.floor(ctx.sampleRate*0.4);
    for(let i=0;i<fade;i++){
      const t=i/fade, end=data[length-fade+i], begin=data[i];
      data[i]=begin*t+end*(1-t);
    }
    return buffer;
  }
  function startNoise() {
    stopNoise();
    const enabled = state.phase==="focus" ? state.focusNoise : state.phase==="rest" ? state.breakNoise : false;
    if (!enabled) return;
    const kind = state.phase==="focus" ? state.focusSound : state.breakSound;
    const names={cafe:"카페 분위기",fire:"장작 타는 소리",rain:"빗소리",plane:"비행기 기내음"};
    try {
      const ctx=state.audio || (state.audio=new (window.AudioContext||window.webkitAudioContext)());
      if(ctx.state==="suspended")ctx.resume();
      const source=ctx.createBufferSource(), gain=ctx.createGain(), filter=ctx.createBiquadFilter();
      source.buffer=makeNoiseBuffer(ctx,kind);source.loop=true;
      if(kind==="cafe"){filter.type="lowpass";filter.frequency.value=1700;gain.gain.value=.18;}
      if(kind==="fire"){filter.type="lowpass";filter.frequency.value=2600;gain.gain.value=.14;}
      if(kind==="rain"){filter.type="lowpass";filter.frequency.value=5200;gain.gain.value=.17;}
      if(kind==="plane"){filter.type="lowpass";filter.frequency.value=420;gain.gain.value=.23;}
      source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start();
      const nodes=[source];
      if(kind==="plane"){
        const osc=ctx.createOscillator(), hum=ctx.createGain();
        osc.type="sine";osc.frequency.value=78;hum.gain.value=.035;
        osc.connect(hum);hum.connect(ctx.destination);osc.start();nodes.push(osc);
      }
      state.noiseNode=nodes;
      $("soundNote").textContent = `${names[kind]} 재생 중 · 실제 현장 녹음이 아닌 생성형 앰비언트 사운드`;
    }catch(e){$("soundNote").textContent="이 기기에서 오디오를 시작할 수 없어요.";}
  }
  async function requestWakeLock() {
    if (!$("wakeLock").checked || !("wakeLock" in navigator)) return;
    try { state.wakeLock=await navigator.wakeLock.request("screen"); } catch(e) {}
  }
  function releaseWakeLock(){if(state.wakeLock){state.wakeLock.release().catch(()=>{});state.wakeLock=null;}}
  function tick() {
    if(!state.running || !state.deadline) return;
    state.remaining=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));
    if(state.remaining<=0){advancePhase();return;}
    render();
  }
  function start() {
    if(!isActive()) {state.phase="focus";state.remaining=state.focus*60;}
    state.running=true;state.deadline=Date.now()+state.remaining*1000;
    if(state.audio && state.audio.state==="suspended")state.audio.resume();
    startNoise();requestWakeLock();
    scheduleNativeTransitions();
    clearInterval(state.interval);state.interval=setInterval(tick,250);render();save();
  }
  function pause() {
    if(state.running){state.remaining=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));}
    state.running=false;state.deadline=null;clearInterval(state.interval);stopNoise();releaseWakeLock();cancelNativeNotifications();render();save();
  }
  function advancePhase() {
    clearInterval(state.interval);state.running=false;state.deadline=null;stopNoise();releaseWakeLock();
    if(state.phase==="focus"){
      state.phase="rest";state.remaining=state.rest*60;
      beep("rest");notify("BLACK PAW · 휴식 시간","잠깐 쉬어가요. 고양이도 기지개를 켜는 중!");
    } else {
      state.completed++;
      if(state.completed>=state.sets){finish();return;}
      state.phase="focus";state.remaining=state.focus*60;
      beep("focus");notify("BLACK PAW · 집중 시간","다시 집중해 볼까요?");
    }
    render();save();start();
  }
  function finish() {
    state.phase="idle";state.remaining=0;state.completed=state.sets;render();save();beep("finish");
    notify("BLACK PAW · 오늘의 루틴 완료","오늘도 정말 고생했어요!");
    $("quote").textContent=quotes[Math.floor(Math.random()*quotes.length)];
    $("completeDialog").showModal();
  }
  function reset() {
    pause();state.phase="idle";state.remaining=state.focus*60;state.completed=0;render();save();
  }
  function skip(){if(isActive())advancePhase();}
  $("startBtn").addEventListener("click",()=>state.running?pause():start());
  $("skipBtn").addEventListener("click",skip);
  $("resetBtn").addEventListener("click",reset);
  $("settingsOpen").addEventListener("click",()=>{if(state.running)pause();$("settingsDialog").showModal();});
  $("completeClose").addEventListener("click",()=>$("completeDialog").close());

  // 전체 초기화: 즉시 실행하지 않고 반드시 한 번 더 확인합니다.
  $("fullResetOpen").addEventListener("click",()=>{
    $("settingsDialog").close();
    $("resetConfirmDialog").showModal();
  });
  $("fullResetShortcut").addEventListener("click",()=>{
    $("resetConfirmDialog").showModal();
  });
  $("resetNo").addEventListener("click",()=>$("resetConfirmDialog").close());
  $("resetYes").addEventListener("click",()=>{
    $("resetConfirmDialog").close();
    pause();
    state.focus=25; state.rest=5; state.sets=4;
    state.completed=0; state.phase="idle"; state.remaining=25*60;
    state.focusNoise=false; state.breakNoise=false; state.focusSound="cafe"; state.breakSound="rain";
    $("focusNoise").checked=false; $("breakNoise").checked=false;
    $("focusSound").value="cafe"; $("breakSound").value="rain";
    $("soundAlert").checked=true; $("vibration").checked=true; $("wakeLock").checked=false;
    localStorage.removeItem("blackpaw-state");
    updateSettingsUI(); render(); save();
    $("headline").textContent="새로운 하루, 다시 시작!";
    $("substatus").textContent="모든 설정과 진행 상황이 초기화됐어요.";
  });
  $("notifyBtn").addEventListener("click",async()=>{
    if (nativePlatform) {
      const ok = await ensureNativeNotificationPermission();
      alert(ok ? "기기 알림 권한이 허용됐어요." : "알림 권한이 허용되지 않았어요. 기기 설정을 확인해 주세요.");
      if (ok && state.running) scheduleNativeTransitions();
      return;
    }
    if(!("Notification" in window)){alert("이 브라우저는 알림을 지원하지 않아요.");return;}
    const p=await Notification.requestPermission();alert(p==="granted"?"알림 권한이 허용됐어요.":"알림 권한이 허용되지 않았어요.");
  });
  document.querySelectorAll("[data-step]").forEach(btn=>btn.addEventListener("click",()=>{
    const key=btn.dataset.step,delta=Number(btn.dataset.delta);
    if(key==="focus")state.focus=Math.max(5,Math.min(180,state.focus+delta));
    if(key==="rest")state.rest=Math.max(5,Math.min(60,state.rest+delta));
    if(key==="sets")state.sets=Math.max(1,Math.min(20,state.sets+delta));
    updateSettingsUI();
  }));
  function updateSettingsUI(){
    $("focusValue").textContent=`${state.focus}분`;$("restValue").textContent=`${state.rest}분`;$("setsValue").textContent=`${state.sets}세트`;
  }
  $("settingsForm").addEventListener("submit",e=>{
    e.preventDefault();$("settingsDialog").close();
    if(state.phase==="idle")state.remaining=state.focus*60;
    state.completed=Math.min(state.completed,state.sets);render();save();
  });
  $("focusNoise").addEventListener("change",e=>{state.focusNoise=e.target.checked;if(state.phase==="focus"&&state.running)startNoise();save();});
  $("breakNoise").addEventListener("change",e=>{state.breakNoise=e.target.checked;if(state.phase==="rest"&&state.running)startNoise();save();});
  $("focusSound").addEventListener("change",e=>{state.focusSound=e.target.value;if(state.phase==="focus"&&state.running)startNoise();save();});
  $("breakSound").addEventListener("change",e=>{state.breakSound=e.target.value;if(state.phase==="rest"&&state.running)startNoise();save();});
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&state.running){tick();requestWakeLock();}
  });
  window.addEventListener("beforeunload",save);

  try {
    const saved=JSON.parse(localStorage.getItem("blackpaw-state")||"null");
    if(saved){
      state.focus=saved.focus||25;state.rest=saved.rest||5;state.sets=saved.sets||4;
      state.focusNoise=!!saved.focusNoise;state.breakNoise=!!saved.breakNoise;
      state.focusSound=saved.focusSound||"cafe";state.breakSound=saved.breakSound||"rain";
      $("focusNoise").checked=state.focusNoise;$("breakNoise").checked=state.breakNoise;
      $("focusSound").value=state.focusSound;$("breakSound").value=state.breakSound;

      // 날짜가 바뀌면 전날의 진행/미완료 타이머만 정리하고 사용자 설정은 유지합니다.
      if(saved.localDate && saved.localDate !== localDayKey()){
        state.completed=0;state.phase="idle";state.running=false;
        state.deadline=null;state.remaining=state.focus*60;
        localStorage.setItem("blackpaw-new-day","1");
        save();
      } else {
        state.completed=saved.completed||0;
        if(saved.running && saved.deadline && saved.deadline>Date.now()){
          state.phase=saved.phase;state.running=true;state.deadline=saved.deadline;state.remaining=Math.ceil((state.deadline-Date.now())/1000);
          start();
        } else if(saved.running && saved.deadline && saved.deadline<=Date.now()){
          state.phase=saved.phase;state.remaining=0;advancePhase();
        } else {state.phase="idle";state.remaining=state.focus*60;}
      }
    } else state.remaining=state.focus*60;
  } catch(e){state.remaining=state.focus*60;}
  updateSettingsUI();render();
  if(localStorage.getItem("blackpaw-new-day")==="1"){
    $("headline").textContent="새로운 하루, 다시 시작!";
    $("substatus").textContent="어제의 미완료 세션은 정리했어요. 설정은 그대로예요.";
    localStorage.removeItem("blackpaw-new-day");
  }
})();