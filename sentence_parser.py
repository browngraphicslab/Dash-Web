def parse_text(file_path):
    with open(file_path, encoding='utf8',mode='r+') as f:
        lines = f.readlines()
        print(len(lines))
        print(lines[1][1])

parse_text("eng_news-typical_2016_10K-sentences.txt")