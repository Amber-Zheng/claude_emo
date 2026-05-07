from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from backend.emotion import analyze_emotion
from backend.responses import get_response
from backend.mars import add_particle, get_particles

load_dotenv()

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': '请输入内容'}), 400
    result = analyze_emotion(text)
    if 'error' in result:
        return jsonify(result), 502
    return jsonify(result)


@app.route('/api/respond', methods=['POST'])
def respond():
    data = request.get_json()
    choice = data.get('choice')
    emotion = data.get('emotion', '复杂的情绪')
    text = data.get('text', '')
    if not choice:
        return jsonify({'error': '缺少选择'}), 400
    feedback = get_response(choice, emotion, text)
    return jsonify({'feedback': feedback})


@app.route('/api/mars/launch', methods=['POST'])
def mars_launch():
    data = request.get_json()
    core   = data.get('core',   'NEUTRAL')
    color  = data.get('color',  '#aaaaaa')
    choice = data.get('choice', 'F1')
    particles = add_particle(core, color, choice)
    return jsonify({'success': True, 'total': len(particles)})


@app.route('/api/mars/particles', methods=['GET'])
def mars_particles():
    return jsonify({'particles': get_particles()})


if __name__ == '__main__':
    app.run(debug=True)
