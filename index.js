/*
*  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
*
*  Use of this source code is governed by a BSD-style license
*  that can be found in the LICENSE file in the root of the source
*  tree.
*/

// This code is adapted from
// https://rawgit.com/Miguelao/demos/master/mediarecorder.html


let  stream, myAudioContext, mediaStreamDest;
let repMode = false;

async function init(constraints) {
  try {
    myAudioContext = new (window.AudioContext || window.webkitAudioContext)(); 
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    maniPulateStream();
  } catch (e) {
    console.error('navigator.getUserMedia error:', e);
    errorMsgElement.innerHTML = `navigator.getUserMedia error:${e.toString()}`;
  }
}

function maniPulateStream() {
  if (typeof workletAudioSend !== 'undefined') {
    workletAudioSend.disconnect();
  }

  if (typeof stream !== 'undefined' && stream != null) {
    // console.log('Audio worklet init add module');
    myAudioContext.audioWorklet.addModule(workletAudioSendBlob).then(() => {
      const audioInput = myAudioContext.createMediaStreamSource(stream);

      const filter = myAudioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      audioInput.connect(filter);

      workletAudioSend = new AudioWorkletNode(myAudioContext, 'worklet-audio-send');

      workletAudioSend.onprocessorerror = function (e) {
        console.log('SOME ERROR');
      };

      filter.connect(workletAudioSend);
      workletAudioSend.connect(myAudioContext.destination);

      const IOAudioSendWorker = new MessageChannel();

      workerAudioSend.postMessage({
        cmd: 'workerIO',
        sampleRate: myAudioContext.sampleRate,
        uid: 4,
      }, [IOAudioSendWorker.port1]);

      // Setup the connection: Port 2 is for worker 2
      workerIO.postMessage({
        cmd: 'workerAudioSend',
      }, [IOAudioSendWorker.port2]);


      const workerWorkletAudioSend = new MessageChannel();

      workerAudioSend.postMessage({
        cmd: 'audioWorkletSend',
        msg: { repMode },
      }, [workerWorkletAudioSend.port1]);

      // Setup the connection: Port 2 is for worker 2
      workletAudioSend.port.postMessage({
        cmd: 'workerAudioSend',
      }, [workerWorkletAudioSend.port2]);
      // console.log('Audio worklet ready audio worklet module');

    });
  }
}

async function bug_687574_callLocalPeers() {
  let lc1; 
  let lc2;
  lc1 = new RTCPeerConnection();
  lc1.count = 0;
  lc1.addEventListener('icecandidate', e => onIceCandidate(lc1, e));
  lc1.addEventListener('connectionstatechange', e => onconnectionstatechange(lc1, e));

  lc2 = new RTCPeerConnection();
  lc2.count = 0;
  lc2.addEventListener('icecandidate', e => onIceCandidate(lc2, e));
  lc2.addEventListener('connectionstatechange', e => onconnectionstatechange(lc2, e));
  lc2.addEventListener('track', gotRemoteStream);

  mediaStreamDest.stream.getTracks().forEach(track => lc1.addTrack(track, mediaStreamDest.stream));

  function onconnectionstatechange(pc, event) {
    if (event.currentTarget.connectionState === 'connected') {
      try { // TODO Dirty try hack
        // console.log('PEER connected webrtc');
        workletAudioRec.disconnect();
        workletAudioRec.connect(mediaStreamDest);
      } catch (e) {
      }
    } else if (event.currentTarget.connectionState === 'disconnected') {
      // console.log('PEER disconnected');
      lc1.close();
      lc2.close();
      lc1 = null;
      lc2 = null;
      try {
        workletAudioRec.disconnect();
        workletAudioRec.connect(myAudioContext.destination);
        // console.log('PEER connected normal audio api');
      } catch (e) {
      }
      cthis.audio.bug_687574_callLocalPeers();
    }
  }

  try {
    const offer = await lc1.createOffer();
    await onCreateOfferSuccess(offer);
  } catch (e) {
    onError();
  }

  function gotRemoteStream(e) {
    const audio = document.createElement('audio');
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
  }

  async function onCreateOfferSuccess(desc) {
    try {
      await lc1.setLocalDescription(desc);
      await lc2.setRemoteDescription(desc);
    } catch (e) {
      onError();
    }
    try {
      const answer = await lc2.createAnswer();
      await onCreateAnswerSuccess(answer);
    } catch (e) {
      onError();
    }
  }

  async function onCreateAnswerSuccess(desc) {
    try {
      await lc2.setLocalDescription(desc);
      await lc1.setRemoteDescription(desc);
    } catch (e) {
      onError();
    }
  }

  async function onIceCandidate(pc, event) {
    if (event.candidate) {
      if (event.candidate.type === 'host') { // We only want to connect over LAN
        try {
          await (getOtherPc(pc).addIceCandidate(event.candidate));
        } catch (e) {
          onError();
        }
      }
    }
  }

  function getOtherPc(pc) {
    return (pc === lc1) ? lc2 : lc1;
  }

  function onError() {
    // Peer connection failed, fallback to standard
    // console.log('PEER fallback');
    try {
      workletAudioRec.connect(myAudioContext.destination);
      lc1.close();
      lc2.close();
      lc1 = null;
      lc2 = null;
    } catch (e) {
      lc1 = null;
      lc2 = null;
    }
  }
}

function initPlay() {
  console.log('audio init worklet suman');
  if (typeof workletAudioRec !== 'undefined') {
    console.log('audio worklet disconnect');
    workletAudioRec.disconnect();
  }
  
  myAudioContext.audioWorklet.addModule(workletAudioRecBlob).then(() => {
  // Setup the connection: Port 1 is for worker 1
    workletAudioRec = new AudioWorkletNode(myAudioContext, 'worklet-audio-rec');
    mediaStreamDest = myAudioContext.createMediaStreamDestination();
    workletAudioRec.connect(myAudioContext.destination);

     bug_687574_callLocalPeers();

    const audioReadyChannel = new MessageChannel();
    workerIO.postMessage({
      cmd: 'workerAudioRec',
    }, [audioReadyChannel.port1]);

    // Setup the connection: Port 2 is for worker 2
    workerAudioRec.postMessage({
      cmd: 'workerIO',
      sampleRate: myAudioContext.sampleRate,
    }, [audioReadyChannel.port2]);

    const audoPlaychannel = new MessageChannel();

    workerAudioRec.postMessage({
      cmd: 'workletAudioRec',
    }, [audoPlaychannel.port1]);

    // Setup the connection: Port 2 is for worker 2
    workletAudioRec.port.postMessage({
      cmd: 'workerAudioRec',
    }, [audoPlaychannel.port2]);
    workerAudioRec.postMessage({ cmd: 'audioWorklet', msg: true });
    
    // virtualclass.gObj.workerAudio = true;
  });
}

var audioConstraint = {
  echoCancellation: true,
  autoGainControl: true,
  channelCount: 1,
  noiseSuppression: true,
};

document.querySelector('button#start').addEventListener('click', async () => {
  const constraints = {
    audio: audioConstraint,
    video: {
      width: 1280, height: 720
    }
  };
  
  console.log('Using media constraints:', constraints);
  await init(constraints);
  initPlay();
});


document.querySelector('button#play').addEventListener('click', async () => {
  workerAudioRec.postMessage({ cmd: 'playStart' });
});

