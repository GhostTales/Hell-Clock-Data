import os


def generate_index():
    repo_root = "."
    index_file = "index.html"
    # Add directories to ignore
    excluded_dirs = {'.git', '.github', 'node_modules'}

    html_content = [
        "<!DOCTYPE html>",
        "<html>",
        "<head><title>Site Index</title><style>body{font-family:sans-serif; padding:20px;} a{display:block; margin:5px 0; text-decoration:none; color:#0366d6;} a:hover{text-decoration:underline;}</style></head>",
        "<body>",
        "<h1>Available Sites</h1>",
        "<ul>"
    ]

    for root, dirs, files in os.walk(repo_root):
        # Filter excluded directories in-place
        dirs[:] = [d for d in dirs if d not in excluded_dirs]

        for file in files:
            if file.endswith(".html") and file != index_file:
                # Create relative path
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, repo_root)
                # Standardize slashes for URLs
                clean_path = rel_path.replace(os.sep, '/')

                html_content.append(f'<li><a href="{clean_path}">{clean_path}</a></li>')

    html_content.append("</ul></body></html>")

    with open(index_file, "w") as f:
        f.write("\n".join(html_content))
    print(f"Generated {index_file} with {len(html_content) - 7} links.")


if __name__ == "__main__":
    generate_index()