import os
import shutil
import random

def get_all_samples(base_dir):
    samples = []
    subdirs = ['train', 'valid', 'test', 'train_excluded']
    for sdir in subdirs:
        img_dir = os.path.join(base_dir, 'images', sdir)
        lbl_dir = os.path.join(base_dir, 'labels', sdir)
        
        if not os.path.exists(lbl_dir):
            continue
            
        for f in os.listdir(lbl_dir):
            if f.endswith('.txt'):
                lbl_path = os.path.join(lbl_dir, f)
                img_path_jpg = os.path.join(img_dir, f.replace('.txt', '.jpg'))
                img_path_png = os.path.join(img_dir, f.replace('.txt', '.png'))
                
                img_path = None
                if os.path.exists(img_path_jpg):
                    img_path = img_path_jpg
                elif os.path.exists(img_path_png):
                    img_path = img_path_png
                
                if img_path:
                    samples.append((img_path, lbl_path))
    return samples

def classify_samples(samples):
    kasta1_debris = []
    kasta2_cluster = []
    kasta3_sperm = []
    
    for img_p, lbl_p in samples:
        has_debris = False
        has_cluster = False
        
        with open(lbl_p, 'r') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) > 0:
                    cls_id = int(parts[0])
                    if cls_id == 2:
                        has_debris = True
                    elif cls_id == 1:
                        has_cluster = True
        
        if has_debris:
            kasta1_debris.append((img_p, lbl_p))
        elif has_cluster:
            kasta2_cluster.append((img_p, lbl_p))
        else:
            kasta3_sperm.append((img_p, lbl_p))
            
    return kasta1_debris, kasta2_cluster, kasta3_sperm

def split_list(lst, train_pct=0.80, valid_pct=0.10):
    total = len(lst)
    tr_end = int(total * train_pct)
    val_end = tr_end + int(total * valid_pct)
    return lst[:tr_end], lst[tr_end:val_end], lst[val_end:]

def move_files(file_list, dest_img_dir, dest_lbl_dir):
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_lbl_dir, exist_ok=True)
    moved_count = 0
    for img_p, lbl_p in file_list:
        dst_img = os.path.join(dest_img_dir, os.path.basename(img_p))
        dst_lbl = os.path.join(dest_lbl_dir, os.path.basename(lbl_p))
        
        if os.path.normpath(img_p).lower() != os.path.normpath(dst_img).lower():
            shutil.move(img_p, dst_img)
        if os.path.normpath(lbl_p).lower() != os.path.normpath(dst_lbl).lower():
            shutil.move(lbl_p, dst_lbl)
        moved_count += 1
    return moved_count

def main():
    random.seed(42)
    base_dir = r"e:\INAFEST\train model\dataset"
    print("Tahap 1: Membaca seluruh dataset...")
    samples = get_all_samples(base_dir)
    print(f"Total gambar ditemukan: {len(samples)}")
    
    print("\nTahap 2: Mengklasifikasikan gambar...")
    k1, k2, k3 = classify_samples(samples)
    print(f"Kasta 1 (Debris): {len(k1)} gambar")
    print(f"Kasta 2 (Cluster): {len(k2)} gambar")
    print(f"Kasta 3 (Sperm Only): {len(k3)} gambar")
    
    random.shuffle(k1)
    random.shuffle(k2)
    random.shuffle(k3)
    
    print("\nTahap 3: Undersampling Kasta 3...")
    target_discard = int(len(samples) * 0.40)
    if target_discard > len(k3):
        target_discard = len(k3)
    
    k3_keep = k3[target_discard:]
    k3_discard = k3[:target_discard]
    
    print(f"Membuang {len(k3_discard)} gambar Sperm-Only ke 'train_excluded'.")
    print(f"Sisa Kasta 3 yang ikut ujian: {len(k3_keep)}")
    
    print("\nTahap 4: Membagi rata (80-10-10)...")
    tr1, va1, te1 = split_list(k1)
    tr2, va2, te2 = split_list(k2)
    tr3, va3, te3 = split_list(k3_keep)
    
    final_train = tr1 + tr2 + tr3
    final_valid = va1 + va2 + va3
    final_test = te1 + te2 + te3
    
    print(f"Train Folder: {len(final_train)} gambar")
    print(f"Valid Folder: {len(final_valid)} gambar")
    print(f"Test Folder: {len(final_test)} gambar")
    print(f"Excluded Folder: {len(k3_discard)} gambar")
    
    print("\nTahap 5: Memindahkan file... (Harap tunggu 1-2 menit)")
    move_files(k3_discard, os.path.join(base_dir, 'images', 'train_excluded'), os.path.join(base_dir, 'labels', 'train_excluded'))
    move_files(final_train, os.path.join(base_dir, 'images', 'train'), os.path.join(base_dir, 'labels', 'train'))
    move_files(final_valid, os.path.join(base_dir, 'images', 'valid'), os.path.join(base_dir, 'labels', 'valid'))
    move_files(final_test, os.path.join(base_dir, 'images', 'test'), os.path.join(base_dir, 'labels', 'test'))
    
    print("\nTahap 6: Menghapus cache YOLO lama...")
    for sdir in ['train', 'valid', 'test']:
        cache_file = os.path.join(base_dir, 'labels', f'{sdir}.cache')
        if os.path.exists(cache_file):
            os.remove(cache_file)
            print(f"- Terhapus: {cache_file}")

    print("\nSELESAI! Dataset sudah sukses dirombak total dan 100% Stratified.")

if __name__ == '__main__':
    main()
