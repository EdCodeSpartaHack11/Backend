# import subprocess
# import sys
# from open_project import get_project_tests

# def compile_cpp(cpp_file: str):
#     p = subprocess.run(
#         ["g++", "-std=c++17", cpp_file, "-o", "a.out"],
#         stdout=subprocess.PIPE,
#         stderr=subprocess.PIPE,
#         text=True,
#     )
#     return p.returncode, p.stdout, p.stderr

# def run_file(input):
#     p = subprocess.run(
#         ["./a.out"],
#         stdout=subprocess.PIPE,
#         stderr=subprocess.PIPE,
#         text=True,
#         input=input
#     )
#     return p.returncode, p.stdout, p.stderr

# #Tested expected output
# def run_test_cases(input, project):
#     compile_cpp(input)
#     run_file(input)
#     for test_case in project["testcases"]:
#         with open(test_case["output"], "r") as f:
#             expected = f.read()
#         with open(test_case["input"], "r") as f:
#             input = f.read()
#         output = run_file(input)[1]
#         print("output:", output)
#         print("expected:", expected)
#         if output == expected:
#             print("TEST CASE PASSED")
#         else:
#             print("TEST CASE FAILED")
    

# if __name__ == "__main__":
#     project_number = "1"
#     run_test_cases("project.cpp", get_project_tests(project_number))
import subprocess
from open_project import get_project_tests

def compile_cpp(cpp_path: str):
    p = subprocess.run(
        ["g++", "-std=c++17", cpp_path, "-o", "a.out"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return p.returncode, p.stdout, p.stderr

def run_exe(stdin_data: str):
    p = subprocess.run(
        ["./a.out"],
        input=stdin_data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return p.returncode, p.stdout, p.stderr

def run_test_cases(cpp_path: str, project: dict):
    # 1) Compile and stop on error
    code, out, err = compile_cpp(cpp_path)
    if code != 0:
        print("COMPILE ERROR:\n", err)
        return

    # 2) Run each testcase
    for tc in project["testcases"]:
        with open(tc["input"], "r") as f:
            tc_in = f.read()
        with open(tc["output"], "r") as f:
            expected = f.read()

        # If your C++ expects "args" from stdin, prepend them here.
        # Example: first line is number of process files, optional -debug.
        # Adjust this to what your program expects.
        arg_line = project.get("stdin_args", "")  # e.g. "3 -debug"
        stdin_data = (arg_line + "\n" + tc_in) if arg_line else tc_in

        rcode, stdout, stderr = run_exe(stdin_data)

        if rcode != 0:
            print(f"{tc.get('id','(no id)')}: RUNTIME ERROR (code={rcode})")
            print("stderr:", stderr)
            continue

        # Normalize for newline differences
        got = stdout.strip()
        exp = expected.strip()

        print(f"\nTest {tc.get('id','(no id)')}")
        print("output:", repr(stdout))
        print("expected:", repr(expected))

        if got == exp:
            print("TEST CASE PASSED")
        else:
            print("TEST CASE FAILED")

if __name__ == "__main__":
    project_number = "1"
    project = get_project_tests(project_number)

    run_test_cases("project.cpp", project)
