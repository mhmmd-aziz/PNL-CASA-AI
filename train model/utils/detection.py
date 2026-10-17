def sperm_class_ids(class_names):
    entries = class_names.items() if isinstance(class_names, dict) else enumerate(class_names)
    class_ids = [
        int(class_id)
        for class_id, name in entries
        if "sperm" in str(name).lower()
        and "cluster" not in str(name).lower()
        and "debris" not in str(name).lower()
    ]
    if not class_ids:
        raise ValueError("Model tidak memiliki kelas sperma individual; analisis tidak dapat dilanjutkan.")
    return class_ids
