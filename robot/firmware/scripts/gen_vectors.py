# Turns test/vectors/hire_keys.json, written by robot/tools/hire-key.mjs, into
# a C++ header for the native tests, so they check exactly what the signer
# produced. Runs before every native build; rewrites the header only when the
# JSON changes.
import json
import os

Import("env")

project = env.subst("$PROJECT_DIR")
source = os.path.join(project, "test", "vectors", "hire_keys.json")
out_dir = os.path.join(env.subst("$BUILD_DIR"), "generated")
out = os.path.join(out_dir, "hire_key_vectors.h")


def c_str(s):
    return json.dumps(s)


def render(doc):
    lines = [
        "// Generated from test/vectors/hire_keys.json by scripts/gen_vectors.py.",
        "#pragma once",
        "#include <stdint.h>",
        "",
        "namespace vectors {",
        "struct Case {",
        "  const char* name;",
        "  const char* keyHex;",
        "  uint32_t now;",
        "  const char* expect;",
        "  bool hasFields;",
        "  uint8_t version;",
        "  const char* serial;",
        "  uint32_t start;",
        "  uint32_t end;",
        "  uint8_t bay;",
        "};",
        "static const char* const kPublicKeyHex = %s;" % c_str(doc["public_key"]),
        "static const char* const kRobotSerial = %s;" % c_str(doc["robot_serial"]),
        "static const Case kCases[] = {",
    ]
    for c in doc["cases"]:
        f = c.get("fields")
        if f:
            fields = "true, %du, %s, %du, %du, %du" % (f["version"], c_str(f["serial"]), f["start"], f["end"], f["bay"])
        else:
            fields = 'false, 0u, "", 0u, 0u, 0u'
        lines.append("    {%s, %s, %du, %s, %s}," % (c_str(c["name"]), c_str(c["key"]), c["now"], c_str(c["expect"]), fields))
    lines += [
        "};",
        "static const unsigned kCaseCount = sizeof(kCases) / sizeof(kCases[0]);",
        "}  // namespace vectors",
        "",
    ]
    return "\n".join(lines)


with open(source) as f:
    text = render(json.load(f))
os.makedirs(out_dir, exist_ok=True)
old = open(out).read() if os.path.exists(out) else None
if old != text:
    with open(out, "w") as f:
        f.write(text)
env.Append(CPPPATH=[out_dir])
