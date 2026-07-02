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

/**
 * Hàm hỗ trợ xử lý Cookie từ Biến môi trường hoặc File vật lý
 * Trả về đường dẫn file cookie hợp lệ, hoặc null nếu không có cấu hình
 */
function getCookiePath() {
    const base64Cookies = process.env.YOUTUBE_COOKIES;
    
    if (base64Cookies) {
        try {
            console.log("🔑 Phát hiện YOUTUBE_COOKIES từ biến môi trường. Đang tiến hành giải mã...");
            const tempCookieDir = os.tmpdir();
            const tempCookiePath = path.join(tempCookieDir, `yt_cookies_${Date.now()}.txt`);
            
            // Giải mã chuỗi mã hóa Base64 về text gốc định dạng Netscape
            const decodedCookies = Buffer.from(base64Cookies, 'base64').toString('utf-8');
            fs.writeFileSync(tempCookiePath, decodedCookies, 'utf-8');
            
            return { path: tempCookiePath, isTemporary: true };
        } catch (e) {
            console.error("❌ Lỗi khi giải mã YOUTUBE_COOKIES Base64:", e.message);
        }
    }

    // Cơ chế Fallback: Nếu không có biến môi trường, tìm file vật lý cũ trong project
    const localCookiePath = path.join(__dirname, "cookies.txt");
    if (fs.existsSync(localCookiePath)) {
        console.log("📁 Không có biến môi trường, sử dụng file cookies.txt cục bộ.");
        return { path: localCookiePath, isTemporary: false };
    }

    console.log("⚠️ Không tìm thấy bất kỳ cấu hình Cookie nào.");
    return null;
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

    // Khởi tạo cấu hình cookie trước khi chạy tiến trình
    const cookieConfig = getCookiePath();

    // Lấy tiêu đề trước (Cần thêm cấu hình cookie cả lúc lấy tiêu đề để tránh bị chặn chặn 403 sớm)
    let titleArgs = [videoUrl, '--get-title'];
    if (cookieConfig) {
        titleArgs.unshift('--cookies', cookieConfig.path);
    }

    execFile(
        exePath,
        titleArgs,
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
            const tempFilePathWithNoExt = path.join(tempDir, baseTempName);

            console.log(`⏳ Đang tiến hành kết nối và tải xuống dữ liệu...`);

            let activeFormat = 'bestaudio/best';
            if (isTwitterOrX) {
                activeFormat = 'best';
            } else if (!isSoundCloud && targetFormat === 'm4a') {
                activeFormat = 'ba[ext=m4a]';
            }

            // Khởi tạo mảng tham số chạy lệnh tải
            let downloadArgs = [videoUrl, '-f', activeFormat, '-o', `${tempFilePathWithNoExt}.%(ext)s`];
            
            // Đưa cấu hình cookie vào tham số tải
            if (cookieConfig) {
                downloadArgs.unshift("--cookies", cookieConfig.path);
            }

            if (!isTwitterOrX) {
                if (targetFormat === 'mp3') {
                    downloadArgs.push(
                        '--ffmpeg-location', ffmpegPath,
                        '--extract-audio',
                        '--audio-format', 'mp3',
                        '--audio-quality', '320k'
                    );
                } else if (targetFormat === 'm4a_old') {
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
                    // Dọn dẹp ngay lập tức file cookie tạm thời (nếu có tạo) sau khi chạy xong lệnh để bảo mật thông tin
                    if (cookieConfig && cookieConfig.isTemporary && fs.existsSync(cookieConfig.path)) {
                        fs.unlinkSync(cookieConfig.path);
                        console.log(`🗑️ Đã xóa file cookie tạm thời khỏi phân vùng hệ thống.`);
                    }

                    if (error) {
                        console.error("========== ERROR ==========");
                        console.error(error);
                        console.error("========== STDERR ==========");
                        console.log(stderr.toString('utf-8'));
                        return res.status(500).send(stderr.toString('utf-8') || error.message);
                    }

                    const files = fs.readdirSync(tempDir);
                    const actualTempFile = files.find(f => f.startsWith(baseTempName));

                    if (!actualTempFile) {
                        console.error('❌ Không tìm thấy file tạm nào được tạo ra!');
                        return res.status(404).send('Lỗi hệ thống: Không tìm thấy file tải về.');
                    }

                    const actualExtension = path.extname(actualTempFile);
                    const realTempFilePath = path.join(tempDir, actualTempFile);

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
    console.log(`🚀 Hệ thống đã sẵn sàng chạy tại cổng ${PORT}`);
});