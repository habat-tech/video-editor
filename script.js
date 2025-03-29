document.addEventListener('DOMContentLoaded', function() {
    // تهيئة FFmpeg
    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({ 
        log: true,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
    });

    // متغيرات التطبيق
    let currentVideoFile = null;
    let isFFmpegLoaded = false;

    // تحميل FFmpeg عند بدء التشغيل
    loadFFmpeg();

    // تبديل الألسنة
    const tabs = document.querySelectorAll('.tabs li');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabId = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');
        });
    });

    // إدارة حقول التقسيم
    document.querySelectorAll('input[name="split-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('num-parts').disabled = radio.value !== 'num_parts';
            document.getElementById('part-duration').disabled = radio.value !== 'part_duration';
        });
    });

    // أحداث الأزرار
    document.getElementById('split-btn').addEventListener('click', splitVideo);
    document.getElementById('compress-btn').addEventListener('click', compressVideo);
    document.getElementById('merge-btn').addEventListener('click', mergeVideos);

    // أحداث اختيار الملفات
    document.getElementById('split-video-file').addEventListener('change', handleVideoSelect);
    document.getElementById('compress-video-file').addEventListener('change', handleVideoSelect);
    document.getElementById('merge-video-1').addEventListener('change', handleVideoSelect);
    document.getElementById('merge-video-2').addEventListener('change', handleVideoSelect);

    // تحميل FFmpeg
    async function loadFFmpeg() {
        updateStatus('جاري تحميل أدوات المعالجة...', 0);
        try {
            await ffmpeg.load();
            isFFmpegLoaded = true;
            updateStatus('جاهز للاستخدام', 100);
            setTimeout(() => {
                document.getElementById('status-bar').classList.add('hidden');
            }, 2000);
        } catch (error) {
            updateStatus('فشل تحميل أدوات المعالجة', 0);
            console.error('FFmpeg load error:', error);
        }
    }

    // اختيار ملف الفيديو
    function handleVideoSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        currentVideoFile = file;
        console.log('تم اختيار ملف:', file.name);
    }

    // تقسيم الفيديو
    async function splitVideo() {
        if (!validateInputs()) return;
        
        const file = document.getElementById('split-video-file').files[0];
        if (!file) {
            showError('يرجى اختيار ملف الفيديو أولاً');
            return;
        }

        try {
            updateStatus('جاري تقسيم الفيديو...', 0);
            
            await ffmpeg.load();
            ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
            
            const splitMode = document.querySelector('input[name="split-mode"]:checked').value;
            let numParts = 2;
            let partDuration = 60;
            
            if (splitMode === 'num_parts') {
                numParts = parseInt(document.getElementById('num-parts').value);
            } else if (splitMode === 'part_duration') {
                partDuration = parseInt(document.getElementById('part-duration').value);
            }
            
            // الحصول على مدة الفيديو
            await ffmpeg.run('-i', 'input.mp4');
            const duration = getVideoDuration();
            if (!duration) {
                showError('تعذر الحصول على مدة الفيديو');
                return;
            }
            
            if (splitMode === 'auto') {
                numParts = Math.ceil(duration / 60);
                partDuration = duration / numParts;
            } else if (splitMode === 'part_duration') {
                numParts = Math.ceil(duration / partDuration);
            }
            
            // تقسيم الفيديو
            const results = [];
            for (let i = 0; i < numParts; i++) {
                const startTime = i * partDuration;
                const outputFile = `part_${i+1}.mp4`;
                
                updateStatus(`جاري إنشاء الجزء ${i+1} من ${numParts}...`, (i / numParts) * 100);
                
                await ffmpeg.run(
                    '-i', 'input.mp4',
                    '-ss', startTime.toString(),
                    '-t', partDuration.toString(),
                    '-c', 'copy',
                    outputFile
                );
                
                const data = ffmpeg.FS('readFile', outputFile);
                const blob = new Blob([data.buffer], { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                
                results.push({
                    name: outputFile,
                    url: url
                });
            }
            
            // عرض النتائج
            const resultsList = document.getElementById('split-files-list');
            resultsList.innerHTML = '';
            
            results.forEach((part, index) => {
                const link = document.createElement('a');
                link.href = part.url;
                link.download = part.name;
                link.innerHTML = `<i class="fas fa-download"></i> ${part.name}`;
                resultsList.appendChild(link);
                resultsList.appendChild(document.createElement('br'));
            });
            
            document.getElementById('split-results').classList.remove('hidden');
            updateStatus('تم تقسيم الفيديو بنجاح!', 100);
            
        } catch (error) {
            console.error('Split error:', error);
            showError('حدث خطأ أثناء تقسيم الفيديو');
        }
    }

    // ضغط الفيديو
    async function compressVideo() {
        if (!validateInputs()) return;
        
        const file = document.getElementById('compress-video-file').files[0];
        if (!file) {
            showError('يرجى اختيار ملف الفيديو أولاً');
            return;
        }

        try {
            updateStatus('جاري ضغط الفيديو...', 0);
            
            await ffmpeg.load();
            ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
            
            const level = document.getElementById('compression-level').value;
            let crf = 23; // القيمة الافتراضية
            
            if (level === 'low') crf = 18;  // جودة أعلى
            else if (level === 'high') crf = 28; // ضغط أعلى
            
            await ffmpeg.run(
                '-i', 'input.mp4',
                '-c:v', 'libx264',
                '-crf', crf.toString(),
                '-preset', 'medium',
                '-c:a', 'copy',
                'compressed.mp4'
            );
            
            const data = ffmpeg.FS('readFile', 'compressed.mp4');
            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            // عرض النتيجة
            const resultDiv = document.getElementById('compressed-file');
            resultDiv.innerHTML = '';
            
            const link = document.createElement('a');
            link.href = url;
            link.download = 'compressed_video.mp4';
            link.innerHTML = `<i class="fas fa-download"></i> compressed_video.mp4`;
            resultDiv.appendChild(link);
            
            document.getElementById('compress-results').classList.remove('hidden');
            updateStatus('تم ضغط الفيديو بنجاح!', 100);
            
        } catch (error) {
            console.error('Compression error:', error);
            showError('حدث خطأ أثناء ضغط الفيديو');
        }
    }

    // دمج الفيديوهات
    async function mergeVideos() {
        if (!validateInputs()) return;
        
        const file1 = document.getElementById('merge-video-1').files[0];
        const file2 = document.getElementById('merge-video-2').files[0];
        
        if (!file1 || !file2) {
            showError('يرجى اختيار ملفي الفيديو أولاً');
            return;
        }

        try {
            updateStatus('جاري دمج الفيديوهات...', 0);
            
            await ffmpeg.load();
            ffmpeg.FS('writeFile', 'input1.mp4', await fetchFile(file1));
            ffmpeg.FS('writeFile', 'input2.mp4', await fetchFile(file2));
            
            const mode = document.getElementById('merge-mode').value;
            let filter = '';
            
            if (mode === 'side_by_side') {
                filter = '[0:v][1:v]hstack=inputs=2[v]';
            } else {
                filter = '[0:v][1:v]vstack=inputs=2[v]';
            }
            
            await ffmpeg.run(
                '-i', 'input1.mp4',
                '-i', 'input2.mp4',
                '-filter_complex', filter,
                '-map', '[v]',
                '-map', '0:a?',
                '-c:v', 'libx264',
                '-preset', 'fast',
                'merged.mp4'
            );
            
            const data = ffmpeg.FS('readFile', 'merged.mp4');
            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            // عرض النتيجة
            const resultDiv = document.getElementById('merged-file');
            resultDiv.innerHTML = '';
            
            const link = document.createElement('a');
            link.href = url;
            link.download = 'merged_video.mp4';
            link.innerHTML = `<i class="fas fa-download"></i> merged_video.mp4`;
            resultDiv.appendChild(link);
            
            document.getElementById('merge-results').classList.remove('hidden');
            updateStatus('تم دمج الفيديوهات بنجاح!', 100);
            
        } catch (error) {
            console.error('Merge error:', error);
            showError('حدث خطأ أثناء دمج الفيديوهات');
        }
    }

    // وظائف مساعدة
    function validateInputs() {
        if (!isFFmpegLoaded) {
            showError('أدوات المعالجة غير جاهزة بعد، يرجى الانتظار...');
            return false;
        }
        return true;
    }

    function getVideoDuration() {
        // في الواقع، يجب استخدام FFprobe للحصول على المدة
        // لكن هذا مثال مبسط
        return 120; // افتراضي 2 دقيقة
    }

    function updateStatus(message, progress) {
        const statusBar = document.getElementById('status-bar');
        statusBar.classList.remove('hidden');
        
        document.getElementById('status-message').textContent = message;
        document.getElementById('progress-bar').style.width = `${progress}%`;
    }

    function showError(message) {
        updateStatus(message, 0);
        setTimeout(() => {
            document.getElementById('status-bar').classList.add('hidden');
        }, 3000);
    }
});
