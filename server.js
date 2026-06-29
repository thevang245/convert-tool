const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isWindows = os.platform() === 'win32';

const ytDlpPath = isWindows
    ? path.join(__dirname, 'yt-dlp.exe')
    : 'yt-dlp';

const ffmpegPath = isWindows
    ? path.join(__dirname, 'ffmpeg.exe')
    : 'ffmpeg';

const app = express();
const PORT = process.env.PORT || 3000;

function xoaDauTiengViet(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .trim();
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    const targetFormat = req.query.format; // Nhận định dạng 'mp3' hoặc 'm4a' từ giao diện gửi lên

    if (!videoUrl) return res.status(400).send('Thiếu link video/audio!');

    const exePath = ytDlpPath;
    console.log(`\n⏳ Đang lấy tiêu đề từ nguồn: ${videoUrl}`);

    const isTwitterOrX = videoUrl.includes('twitter.com') || videoUrl.includes('x.com');
    const isSoundCloud = videoUrl.includes('soundcloud.com');

    // Xác định downloadFormat gốc
    let downloadFormat = 'ba';
    if (isTwitterOrX) {
        downloadFormat = 'b';
    } else if (!isSoundCloud) {
        downloadFormat = 'ba[ext=m4a]';
    }

    // Lấy tiêu đề trước
    execFile(
        exePath,
        [videoUrl, '--get-title'],
        {
            encoding: 'buffer',
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        },
        (titleError, titleStdout) => {
            let cleanTitle = 'tai_ve_chat_luong_cao';
            if (isTwitterOrX) cleanTitle = 'twitter_video';
            if (isSoundCloud) cleanTitle = 'soundcloud_music';

            if (!titleError && titleStdout) {
                const rawTitle = titleStdout.toString('utf-8').trim();
                console.log(`📌 Tiêu đề nhận diện gốc: ${rawTitle}`);

                cleanTitle = xoaDauTiengViet(rawTitle);
                cleanTitle = cleanTitle.replace(/[/\\?%*:|"<>]/g, '-');
            }

            const baseTempName = `temp_${Date.now()}`;

            const tempDir = os.tmpdir();

            const tempFilePathWithNoExt =
                path.join(tempDir, baseTempName);

            console.log(`⏳ Đang tiến hành kết nối và tải xuống dữ liệu...`);

            // Tối ưu hóa biến format tải ban đầu dựa trên nền tảng/nhu cầu
            // 1. XÁC ĐỊNH FORMAT ĐẦU VÀO ĐỂ TẢI (KHÔI PHỤC ĐỂ LẤY FILE SIÊU NHẸ)
            let activeFormat = 'bestaudio/best';
            if (isTwitterOrX) {
                activeFormat = 'best';
            } else if (!isSoundCloud && targetFormat === 'm4a') {
                // Nếu tải YouTube M4A thường: Ép lọc đúng luồng m4a gốc của YouTube để file nhẹ nhất (3.5MB)
                activeFormat = 'ba[ext=m4a]';
            }

            // Khởi tạo mảng tham số chạy lệnh
            let downloadArgs = [videoUrl, '-f', activeFormat, '-o', `${tempFilePathWithNoExt}.%(ext)s`];
            downloadArgs.unshift(
                "--cookies",
                path.join(__dirname, "cookies.txt")
            );
            // 2. XỬ LÝ PHÂN NHÁNH ĐỊNH DẠNG THEO YÊU CẦU TỪ FRONTEND
            if (!isTwitterOrX) {
                if (targetFormat === 'mp3') {
                    // LỰA CHỌN: MP3 320kbps
                    downloadArgs.push(
                        '--ffmpeg-location', ffmpegPath,
                        '--extract-audio',
                        '--audio-format', 'mp3',
                        '--audio-quality', '320k'
                    );
                } else if (targetFormat === 'm4a_old') {
                    // LỰA CHỌN: M4A (iOS đời cũ) - Cần luồng tốt nhất rồi convert sang AAC-LC 192k
                    downloadArgs.push(
                        '--ffmpeg-location', ffmpegPath,
                        '--extract-audio',
                        '--audio-format', 'm4a',
                        '--audio-quality', '192k',
                        '--postprocessor-args', 'ExtractAudio:-c:a aac -profile:a aac_low'
                    );
                }
            }

            execFile(
                exePath,
                downloadArgs,
                { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
                (error, stdout, stderr) => {
                    if (error) {
                        console.error("========== ERROR ==========");
                        console.error(error);

                        console.error("========== STDOUT ==========");
                        console.log(stdout);

                        console.error("========== STDERR ==========");
                        console.log(stderr);

                        return res.status(500).send(stderr || error.message);
                    }

                    const files = fs.readdirSync(tempDir);
                    const actualTempFile = files.find(f => f.startsWith(baseTempName));

                    if (!actualTempFile) {
                        console.error('❌ Không tìm thấy file tạm nào được tạo ra!');
                        return res.status(404).send('Lỗi hệ thống: Không tìm thấy file tải về.');
                    }

                    const actualExtension = path.extname(actualTempFile);
                    const realTempFilePath =
                        path.join(tempDir, actualTempFile);

                    const finalDownloadName = `${cleanTitle}${actualExtension}`;
                    console.log(`✅ Đã xử lý xong file thực tế: ${actualTempFile}. Đang truyền về máy...`);

                    res.download(realTempFilePath, finalDownloadName, (err) => {
                        if (err) console.error('Lỗi khi gửi file:', err);

                        if (fs.existsSync(realTempFilePath)) {
                            fs.unlinkSync(realTempFilePath);
                            console.log(`🗑️ Đã dọn dẹp file tạm trên server: ${actualTempFile}`);
                        }
                    });
                }
            );
        }
    );
});

app.listen(PORT, () => {
    console.log(`🚀 Hệ thống đã sẵn sàng chạy tại ${PORT}`);
});