"""
test_camera.py — Verify the built-in camera works.
Run with:  python test_camera.py
Press 'q' to quit the preview window.
"""
import sys
import cv2

INDEX = 0  # Try 1 if 0 doesn't work

cap = cv2.VideoCapture(INDEX)
if not cap.isOpened():
    print(f"ERROR: Could not open camera at index {INDEX}. Try INDEX=1.")
    sys.exit(1)

print(f"Camera opened at index {INDEX}. Press 'q' to quit.")
while True:
    ret, frame = cap.read()
    if not ret:
        print("ERROR: Failed to read frame.")
        break
    cv2.imshow("Camera Test — press q to quit", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("Camera test passed.")
