import json

with open("../schemas_files/projects.json") as f:
    manifest = json.load(f)

def get_project_tests(project_id: str):
    return manifest["projects"][project_id]

