import os
import shutil
import random

def main():
    print("Mulai proses Undersampling (Memangkas 40% Dataset)...")
    
    # Paths
    base_dir = r"e:\INAFEST\train model\dataset"
    labels_train = os.path.join(base_dir, "labels", "train")
    images_train = os.path.join(base_dir, "images", "train")
    
    labels_excluded = os.path.join(base_dir, "labels", "train_excluded")
    images_excluded = os.path.join(base_dir, "images", "train_excluded")
    
    os.makedirs(labels_excluded, exist_ok=True)
    os.makedirs(images_excluded, exist_ok=True)
    
    all_label_files = [f for f in os.listdir(labels_train) if f.endswith('.txt')]
    
    only_sperm_files = []
    
    for f_name in all_label_files:
        label_path = os.path.join(labels_train, f_name)
        
        has_cluster = False
        has_debris = False
        has_sperm = False
        
        with open(label_path, 'r') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) > 0:
                    cls_id = int(parts[0])
                    if cls_id == 0:
                        has_sperm = True
                    elif cls_id == 1:
                        has_cluster = True
                    elif cls_id == 2:
                        has_debris = True
                        
        if has_sperm and not has_cluster and not has_debris:
            only_sperm_files.append(f_name)
            
    print(f"Total file training: {len(all_label_files)}")
    print(f"Total file yang HANYA berisi Sperm: {len(only_sperm_files)}")
    
    # Target to remove 40% of the total dataset size
    target_remove_count = int(len(all_label_files) * 0.40)
    
    random.seed(42) # Biar konsisten
    
    if target_remove_count > len(only_sperm_files):
        target_remove_count = len(only_sperm_files)
        
    files_to_remove = random.sample(only_sperm_files, target_remove_count)
    
    print(f"Akan memindahkan {len(files_to_remove)} gambar ke folder 'train_excluded'...")
    
    success_count = 0
    for f_name in files_to_remove:
        src_label = os.path.join(labels_train, f_name)
        dst_label = os.path.join(labels_excluded, f_name)
        
        img_name = f_name.replace('.txt', '.jpg')
        src_img = os.path.join(images_train, img_name)
        dst_img = os.path.join(images_excluded, img_name)
        
        if not os.path.exists(src_img):
            # Coba .png kalau .jpg tidak ada
            img_name_png = f_name.replace('.txt', '.png')
            src_img_png = os.path.join(images_train, img_name_png)
            if os.path.exists(src_img_png):
                src_img = src_img_png
                dst_img = os.path.join(images_excluded, img_name_png)
                
        if os.path.exists(src_img):
            try:
                shutil.move(src_label, dst_label)
                shutil.move(src_img, dst_img)
                success_count += 1
            except Exception as e:
                print(f"Gagal memindahkan {f_name}: {e}")
        else:
            print(f"WARNING: Gambar untuk {f_name} tidak ditemukan.")
            
    print(f"\nSELESAI! Berhasil mengamankan/membuang {success_count} gambar dan label ke folder excluded.")
    print(f"Sisa gambar di folder training sekarang: {len(all_label_files) - success_count} gambar.")

if __name__ == '__main__':
    main()
