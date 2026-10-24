import { tmpdir } from 'os'
import path, { join } from 'path'
import { existsSync, readdirSync, statSync, unlinkSync } from 'fs'

export default async ({ sock, msg, args, jid }) => {
  const eg = '✅'
  await sock.sendMessage(jid, { text: `*𝘼𝙍𝘾𝙃𝙄𝙑𝙊𝙎 𝘿𝙀 𝙇𝘼 𝘾𝘼𝙍𝙋𝙀𝙏𝘼 𝙏𝙈𝙋 𝙁𝙐𝙀𝙍𝙊𝙉 𝙀𝙇𝙄𝙈𝙄𝙉𝘼𝘿𝙊𝙎.*\n\n*FILES IN THE TMP FOLDER WERE DELETED.*`, quoted: msg })
  const dirs = [tmpdir(), join(process.cwd(), 'tmp')]
  dirs.forEach((dirname) => {
    try {
      if (!existsSync(dirname)) return
      readdirSync(dirname).forEach((file) => {
        const filePath = join(dirname, file)
        try {
          unlinkSync(filePath)
        } catch {}
      })
    } catch {}
  })
}
