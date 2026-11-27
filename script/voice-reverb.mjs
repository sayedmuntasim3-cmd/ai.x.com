/**
 * কোরআন ভয়েসে ইকো/রিভার্ব/স্পেস ইফেক্ট যোগ করার স্ক্রিপ্ট
 * ব্যবহার: node script/voice-reverb.mjs --input <input.wav> --output <output.wav> [--effect <effect>] [--mix <0-1>]
 * effect: hall | plate | echo | space | projection | viral | cinematic | cozy | grand | soft (ডিফল্ট: viral)
 */

import audio from 'audio'
import fs from 'fs'
import { argv } from 'node:process'

// কমান্ড লাইন আর্গুমেন্ট পার্স করা
const args = argv.slice(2)
const inputIndex = args.indexOf('--input')
const outputIndex = args.indexOf('--output')
const effectIndex = args.indexOf('--effect')
const mixIndex = args.indexOf('--mix')

const inputFile = inputIndex >= 0 ? args[inputIndex + 1] : null
const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null
const effect = effectIndex >= 0 ? args[effectIndex + 1] : 'viral'
const mix = mixIndex >= 0 ? parseFloat(args[mixIndex + 1]) : 0.25

if (!inputFile || !outputFile) {
  console.error('ব্যবহার: node script/voice-reverb.mjs --input <input.wav> --output <output.wav> [--effect <effect>] [--mix <0-1>]')
  process.exit(1)
}

// ইমপালস রেসপন্স তৈরি করার ফাংশন
function createIR(type, sampleRate = 44100, duration = 2.5) {
  const samples = sampleRate * duration
  const samplesArray = new Float32Array(samples)

  switch (type) {
    case 'hall':
    case 'hallway':
      // হলের রিভার্ব — দুর্বল, দীর্ঘ
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const envelopes = [
          Math.exp(-t * 2.5),
          Math.exp(-(t - 0.02) * 3) * 0.6,
          Math.exp(-(t - 0.05) * 4) * 0.3,
        ]
        const noise = envelopes.reduce((sum, e) => sum + (Math.random() * 2 - 1) * Math.max(0, e), 0)
        samplesArray[i] = noise * 0.5
      }
      break

    case 'plate':
      // প্লেট রিভার্ব — মেটালিক, মাঝারি
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const envelopes = [
          Math.exp(-t * 4),
          Math.exp(-(t - 0.01) * 5) * 0.7,
          Math.exp(-(t - 0.03) * 6) * 0.4,
        ]
        const noise = envelopes.reduce((sum, e) => sum + (Math.random() * 2 - 1) * Math.max(0, e) * (1 + Math.sin(2 * Math.PI * 200 * t) * 0.1), 0)
        samplesArray[i] = noise * 0.6
      }
      break

    case 'echo':
      // ইকো — স্পষ্ট ডেলে
      const echoSamples = sampleRate * 0.35 // 350ms ডেলে
      for (let i = 0; i < samples; i++) {
        if (i < echoSamples) {
          samplesArray[i] = (Math.random() * 2 - 1) * 0.4
        } else {
          const echoIndex = i - echoSamples
          if (echoIndex < samples) {
            samplesArray[echoIndex] = (Math.random() * 2 - 1) * 0.25
          }
        }
      }
      break

    case 'space':
      // স্পেস — হালকা রিভার্ব
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const envelope = Math.exp(-t * 5)
        const noise = (Math.random() * 2 - 1) * envelope * 0.5
        samplesArray[i] = noise * 0.4
      }
      break

    case 'projection':
      // প্রজেকশন — ভয়েসকে বড় হলে প্রজেক্ট করার মতো
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const envelopes = [
          Math.exp(-t * 1.8),
          Math.exp(-(t - 0.03) * 2.5) * 0.5,
          Math.exp(-(t - 0.08) * 3.5) * 0.3,
          Math.exp(-(t - 0.15) * 5) * 0.2,
        ]
        const noise = envelopes.reduce((sum, e) => sum + (Math.random() * 2 - 1) * Math.max(0, e) * (1 + Math.sin(2 * Math.PI * 150 * t) * 0.05), 0)
        samplesArray[i] = noise * 0.7
      }
      break

    case 'viral':
      // ভাইরাল স্টাইল — ইউটিউব কোরআন ভিডিওর মতো ভয়েস
      // হালকা রিভার্ব + ইকো + প্রজেকশন
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        // রিভার্ব কম্পোনেন্ট
        const reverb = Math.exp(-t * 3.5) * 0.6
        const reverbEcho = Math.exp(-(t - 0.02) * 4.5) * 0.3
        const reverbLate = Math.exp(-(t - 0.06) * 6) * 0.15
        // ইকো কম্পোনেন্ট
        const echo = (i > sampleRate * 0.3) ? 0.2 : 0
        // প্রজেকশন কম্পোনেন্ট
        const projection = Math.exp(-t * 2) * 0.4
        const combined = reverb + reverbEcho + reverbLate + echo + projection
        samplesArray[i] = (Math.random() * 2 - 1) * Math.max(0, combined) * 0.55
      }
      break

    case 'cinematic':
      // সিনেম্যাটিক স্টাইল — গভীর, ড্রামাটিক
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const early = Math.exp(-t * 2) * 0.7
        const early2 = Math.exp(-(t - 0.015) * 2.5) * 0.5
        const late = Math.exp(-(t - 0.05) * 3) * 0.3
        const late2 = Math.exp(-(t - 0.1) * 4) * 0.2
        const diffusion = Math.sin(2 * Math.PI * 300 * t) * 0.1 * Math.exp(-t * 3)
        samplesArray[i] = (Math.random() * 2 - 1) * (early + early2 + late + late2 + diffusion) * 0.6
      }
      break

    case 'cozy':
      // কোজি স্টাইল — হালকা, উষ্ণ
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const early = Math.exp(-t * 5) * 0.5
        const early2 = Math.exp(-(t - 0.01) * 6) * 0.3
        const warm = Math.sin(2 * Math.PI * 80 * t) * 0.05 * Math.exp(-t * 4)
        samplesArray[i] = (Math.random() * 2 - 1) * (early + early2 + warm) * 0.4
      }
      break

    case 'grand':
      // গ্র্যান্ড স্টাইল — বড় হল, ইম্পোর্ট্যান্ট
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const early = Math.exp(-t * 1.5) * 0.8
        const early2 = Math.exp(-(t - 0.02) * 2) * 0.6
        const late = Math.exp(-(t - 0.05) * 2.5) * 0.4
        const late2 = Math.exp(-(t - 0.1) * 3) * 0.25
        const late3 = Math.exp(-(t - 0.2) * 4) * 0.15
        const shimmer = Math.sin(2 * Math.PI * 200 * t) * 0.15 * Math.exp(-t * 2)
        samplesArray[i] = (Math.random() * 2 - 1) * (early + early2 + late + late2 + late3 + shimmer) * 0.7
      }
      break

    case 'soft':
      // সফট স্টাইল — হালকা হালকা স্পেস
      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate
        const ambient = Math.exp(-t * 6) * 0.3
        const ambient2 = Math.exp(-(t - 0.015) * 7) * 0.15
        samplesArray[i] = (Math.random() * 2 - 1) * (ambient + ambient2) * 0.3
      }
      break
  }

  return samplesArray
}

async function processVoice(inputFile, outputFile, effect, mix) {
  console.log(`ভয়েস প্রসেস করা হচ্ছে: ${inputFile}`)
  console.log(`ইফেক্ট: ${effect}, মিক্স: ${mix}`)

  const voice = audio(inputFile)
  console.log(`ভয়েস লোড হয়েছে, দৈর্ঘ্য: ${voice.duration?.toFixed(2)} সেকেন্ড`)

  // IR তৈরি করা — স্যাম্পল রেট ভয়েসের সাথে মিলিয়ে নেওয়া
  const voiceAudio = audio(inputFile)
  const sampleRate = voiceAudio.sampleRate || 44100
  const ir = createIR(effect, sampleRate, 2.5)
  const irFile = `/tmp/ir-${effect}-${Date.now()}.wav`

  // IR ফাইল সেভ করা
  function float32ToWav(samples, sampleRate) {
    const bytesPerSample = 2
    const blockAlign = 1 * bytesPerSample
    const dataSize = samples.length * bytesPerSample
    const headerSize = 44
    const totalSize = headerSize + dataSize
    const buffer = Buffer.alloc(totalSize)
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(totalSize - 8, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * blockAlign, 28)
    buffer.writeUInt16LE(blockAlign, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      buffer.writeInt16LE(intSample, headerSize + i * 2)
    }
    return buffer
  }

  fs.writeFileSync(irFile, float32ToWav(ir, 44100))
  console.log(`IR ফাইল তৈরি হয়েছে: ${irFile}`)

  // convolve ব্যবহার করে রিভার্ব যোগ করা
  voice.convolve(irFile, mix)
  console.log(`রিভার্ব যোগ করা হয়েছে (mix: ${mix})`)

  // প্রসেসড ফাইল সেভ করা
  await voice.save(outputFile)
  console.log(`প্রসেসড ফাইল সেভ হয়েছে: ${outputFile}`)

  // IR ফাইল ডিলিট করা
  fs.unlinkSync(irFile)
  console.log('IR ফাইল ডিলিট করা হয়েছে')
}

processVoice(inputFile, outputFile, effect, mix).catch(e => {
  console.error('এরর:', e.message)
  process.exit(1)
})
