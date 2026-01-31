import subprocess
import sys

def compile_cpp(cpp_file: str):
    p = subprocess.run(
        ["g++", "-std=c++17", cpp_file, "-o", "a.out"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return p.returncode, p.stdout, p.stderr

def run_file():
    p = subprocess.run(
        ["./a.out"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return p.returncode, p.stdout, p.stderr

#Tested expected output
expected = "This works!"
def run_test_cases(input, output):
    code, out, err = compile_cpp(input)
    if code != 0:
        print("COMPILE ERROR")
        print(err)
    else:
        print("COMPILE OK")
        print(run_file()[1])
        if run_file()[1] == expected:
            print("TEST CASE PASSED")
        else:
            print("TEST CASE FAILED")

if __name__ == "__main__":
    run_test_cases("test.cpp", expected)
    # code, out, err = compile_cpp(sys.argv[1])
    # if code != 0:
    #     print("COMPILE ERROR")
    #     print(err)
    # else:
    #     print("COMPILE OK")
    #     print(run_file()[1])