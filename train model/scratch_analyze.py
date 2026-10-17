import os
import time

start_time = time.time()
label_dir = r"e:\INAFEST\train model\dataset\labels\train"

class_counts = {0: 0, 1: 0, 2: 0}
empty_files = 0
total_boxes = 0
avg_w = 0
avg_h = 0
files_processed = 0

print("Scanning directory via os.scandir...")
try:
    with os.scandir(label_dir) as entries:
        for entry in entries:
            if entry.is_file() and entry.name.endswith('.txt'):
                fpath = entry.path
                if entry.stat().st_size == 0:
                    empty_files += 1
                else:
                    try:
                        with open(fpath, 'r') as f:
                            lines = f.readlines()
                            if not lines:
                                empty_files += 1
                            else:
                                for line in lines:
                                    parts = line.strip().split()
                                    if len(parts) >= 5:
                                        cls_id = int(parts[0])
                                        w = float(parts[3])
                                        h = float(parts[4])
                                        
                                        if cls_id in class_counts:
                                            class_counts[cls_id] += 1
                                        else:
                                            class_counts[cls_id] = 1
                                        
                                        total_boxes += 1
                                        avg_w += w
                                        avg_h += h
                    except Exception as e:
                        pass
                
                files_processed += 1
                if files_processed >= 1000:
                    break
except Exception as e:
    print(f"Error reading directory: {e}")

if total_boxes > 0:
    avg_w /= total_boxes
    avg_h /= total_boxes

print("\n--- DATASET HEALTH REPORT (ESTIMASI DARI 1000 GAMBAR) ---")
print(f"Total Sample Gambar yg dicek: {files_processed}")
print(f"Gambar Kosong (Tidak ada objek/Background): {empty_files}")
print(f"Total Sperma/Objek yang dilabeli: {total_boxes}")
print(f"Distribusi Kelas (0=sperm, 1=cluster, 2=debris): {class_counts}")
print(f"Rata-rata Lebar Objek: {avg_w:.4f} (sekitar {avg_w*640:.1f} pixel di resolusi 640x640)")
print(f"Rata-rata Tinggi Objek: {avg_h:.4f} (sekitar {avg_h*640:.1f} pixel di resolusi 640x640)")
print(f"Selesai dianalisis dalam {time.time() - start_time:.2f} detik.")
