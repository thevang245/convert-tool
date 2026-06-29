const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

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

    const exePath = path.join(__dirname, 'yt-dlp.exe');
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
            const tempFilePathWithNoExt = path.join(__dirname, baseTempName);

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

            // 2. XỬ LÝ PHÂN NHÁNH ĐỊNH DẠNG THEO YÊU CẦU TỪ FRONTEND
            if (!isTwitterOrX) {
                if (targetFormat === 'mp3') {
                    // LỰA CHỌN: MP3 320kbps
                    downloadArgs.push(
                        '--ffmpeg-location', __dirname,
                        '--extract-audio',
                        '--audio-format', 'mp3',
                        '--audio-quality', '320k'
                    );
                } else if (targetFormat === 'm4a_old') {
                    // LỰA CHỌN: M4A (iOS đời cũ) - Cần luồng tốt nhất rồi convert sang AAC-LC 192k
                    downloadArgs.push(
                        '--ffmpeg-location', __dirname,
                        '--extract-audio',
                        '--audio-format', 'm4a',
                        '--audio-quality', '192k',
                        '--postprocessor-args', 'ExtractAudio:-c:a aac -profile:a aac_low'
                    );
                } else {
                    // LỰA CHỌN: M4A chuẩn - Không thêm tham số bóc tách phức tạp, để yt-dlp lấy thẳng luồng ba[ext=m4a] ở trên
                    // Chỉ cần khai báo vị trí ffmpeg phòng hờ
                    downloadArgs.push('--ffmpeg-location', __dirname);
                }
            }

            execFile(
                exePath,
                downloadArgs,
                { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
                (error, stdout, stderr) => {
                    if (error) {
                        console.error('❌ Lỗi chạy yt-dlp:', error);
                        return res.status(500).send('Không thể xử lý liên kết này.');
                    }

                    const files = fs.readdirSync(__dirname);
                    const actualTempFile = files.find(f => f.startsWith(baseTempName));

                    if (!actualTempFile) {
                        console.error('❌ Không tìm thấy file tạm nào được tạo ra!');
                        return res.status(404).send('Lỗi hệ thống: Không tìm thấy file tải về.');
                    }

                    const actualExtension = path.extname(actualTempFile);
                    const realTempFilePath = path.join(__dirname, actualTempFile);

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
    console.log(`🚀 Hệ thống đã sẵn sàng chạy tại: http://localhost:${PORT}`);
});