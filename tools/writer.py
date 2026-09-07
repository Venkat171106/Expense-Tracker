import base64, os, sys

def write_b64(path, b64_str):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    c = b64_str.strip()
    rem = len(c) % 4
    if rem > 0:
        c += '=' * (4 - rem)
    with open(path, 'wb') as f:
        f.write(base64.b64decode(c))
    print(f'Written: {path}')

if __name__ == '__main__':
    write_b64(sys.argv[1], sys.argv[2])
def append_b64(path, b64_str):
    c = b64_str.strip()
    rem = len(c) % 4
    if rem > 0:
        c += '=' * (4 - rem)
    with open(path, 'ab') as f:
        f.write(base64.b64decode(c))
    print(f'Appended: {path}')
