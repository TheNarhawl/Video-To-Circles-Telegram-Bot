import { Telegraf } from 'telegraf';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { config } from 'dotenv';
config({ path: './.env' });


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegPath);

const bot = new Telegraf(process.env.BOT_TOKEN, {});

bot.telegram.setMyCommands([
  { command: '/start', description: 'Начать работу' },
  { command: '/help', description: 'Помощь & Связь с автором' },
]);


bot.command('start', async (ctx) => {
  await ctx.react('🍌');
  await ctx.reply(
    'Привет! 👋\n\nЯ - бот, который конвертирует видео в <b>кружочки Telegram.</b>\n\nЧтобы начать, пришлите мне видео любого формата <b>весом менее 100Мбайт</b>',
    {
      parse_mode: "HTML",
    });

});


bot.command('help', async (ctx) => {
  await ctx.react('🍌');
  await ctx.reply(
    '📧 <b>Связь с автором:</b> @Narhawl\n\n🖊 <b>Исходный код бота:</b> <a href="https://github.com/TheNarhawl/Video-To-Circles-Telegram-Bot">GitHub</a>',
    {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });

});


let isProcessing = false;

bot.on('video', async (ctx) => {

  await ctx.react('🍌');
  let statusMessage;

  if (isProcessing) {
    await ctx.reply('❗ <b>Бот уже обрабатывает видео. Подождите, пока текущее видео будет обработано! </b>',
      {
        parse_mode: 'HTML'
      }
    );
    return;
  }

  isProcessing = true;

  try {
    statusMessage = await ctx.reply(`Видео получено! 📝\n\n<b>Обработка . . .</b>`,
      {
        parse_mode: "HTML"
      });


    const videoFileId = ctx.message.video.file_id;
    const videoDuration = ctx.message.video.duration;
    const videoSize = ctx.message.video.file_size;
    const isTooLong = videoDuration > 60;

    await ctx.replyWithChatAction('record_video');

    if (videoSize > 100 * 1024 * 1024) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        null,
        'Ваше видео слишком большое (больше 100 MB) ❌\n\n<b>Попробуйте уменьшить объём и прислать его снова.</b>',
        {
          parse_mode: "HTML"
        }
      );
      return;
    }

    const videoPath = resolve(__dirname, 'temp_video.mp4');
    const outputPath = resolve(__dirname, 'circle_video.mp4');

    const fileUrl = await ctx.telegram.getFileLink(videoFileId);
    const res = await fetch(fileUrl);

    if (!res.ok) {
      throw new Error('Ошибка при загрузке файла');
    }

    const fileStream = fs.createWriteStream(videoPath);
    res.body.pipe(fileStream);

    await new Promise((resolve, reject) => {
      res.body.on('end', resolve);
      res.body.on('error', reject);
    });

    await ctx.replyWithChatAction('upload_video');

    await new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg(videoPath)
        .output(outputPath)
        .videoFilter([
          'crop=\'min(iw\\,ih)\':\'min(iw\\,ih)\'',
          'scale=240:240'
        ])
        .outputOptions([
          '-preset ultrafast',
          '-threads 8',
          '-crf 18',
          '-c:v libx264',
        ]);

      if (isTooLong) {
        console.log('Видео длится больше 60 секунд, обрезаем до 60 секунд.');
        ffmpegCommand.setDuration(60);

        ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          null,
          'Видео слишком длинное!\n\n<b>Оно будет обрезано до 60 секунд . . .</b>',
          {
            parse_mode: "HTML"
          }
        );
      }

      ffmpegCommand
        .on('end', () => {
          console.log('Преобразование видео завершено');

          ctx.replyWithChatAction('record_video');

          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          console.error('Ошибка FFmpeg:', err);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .on('start', (commandLine) => {
          console.log('Запуск FFmpeg с командой:', commandLine);
        })
        .run();
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      'Видео обработано!\n\n<b>Отправка . . .</b>',
      {
        parse_mode: "HTML"
      }
    );

    await ctx.replyWithVideoNote({ source: outputPath }, {
      reply_to_message_id: ctx.message.message_id,
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      'Готово! ✅\n\n<b>Ваш кружок: </b>',
      {
        parse_mode: 'HTML'
      }
    );

    fs.unlinkSync(videoPath);
    fs.unlinkSync(outputPath);
  }
  catch (error) {
    console.error('Ошибка обработки видео:', error);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      'Не удалось обработать видео! ❌\n\n<b>Попробуйте ещё раз.</b>',
      {
        parse_mode: 'HTML'
      }
    );
  } finally {
    isProcessing = false;
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);

})

bot.launch()
console.log('Бот запущен!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));