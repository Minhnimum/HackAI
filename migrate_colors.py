import os
import glob
import re

replacements = {
    r'#fdfdfa': 'var(--bg-primary)',
    r'#ffffff': 'var(--bg-secondary)',
    r'\bwhite\b': 'var(--bg-secondary)',
    r'#f8fafc': 'var(--bg-hover)',
    r'#eef2ff': 'var(--bg-active)',
    
    r'#1e1b4b': 'var(--text-main)',
    r'#334155': 'var(--text-secondary)',
    r'#475569': 'var(--text-muted)',
    r'#64748b': 'var(--text-muted)',
    r'#94a3b8': 'var(--text-placeholder)',
    
    r'#4f46e5': 'var(--accent)',
    r'#4338ca': 'var(--accent-hover)',
    r'#3730a3': 'var(--accent-dark)',
    r'#818cf8': 'var(--accent-light)',
    
    r'#e0e7ff': 'var(--border-light)',
    r'#c7d2fe': 'var(--border-main)',
    r'#a5b4fc': 'var(--border-strong)',
    
    r'79,\s*70,\s*229': 'var(--shadow-color)',
    r'129,\s*140,\s*248': 'var(--shadow-color)'
}

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    for k, v in replacements.items():
        if k == r'\bwhite\b':
            # Be very careful with 'white', only replace in css values, e.g. "background: white;" or "color: white;"
            content = re.sub(r':\s*white\s*([;}!])', f': {v}\\1', content)
        else:
            # Case insensitive exact match for hex
            content = re.sub(k, v, content, flags=re.IGNORECASE)
            
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

css_files = glob.glob('c:/Users/mkhoa/OneDrive/Documents/HackAI/frontend/src/**/*.css', recursive=True)
for filepath in css_files:
    process_file(filepath)
