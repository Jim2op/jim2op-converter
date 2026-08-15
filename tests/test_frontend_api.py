import unittest

import app


class JavaScriptFrontendApiTests(unittest.TestCase):
    """Verify the static shell and API endpoints used by the browser client."""

    def setUp(self):
        app.app.config.update(TESTING=True)
        self.client = app.app.test_client()

    def test_static_shell_serves_for_client_side_routes(self):
        for path in ('/', '/image', '/video', '/youtube'):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn(b'id="app"', response.data)
            self.assertIn(b'/static/app.js', response.data)
            response.close()

    def test_config_endpoint_exposes_frontend_select_options(self):
        response = self.client.get('/api/config')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn('PNG', payload['image_formats'])
        self.assertIn('GIF', payload['video_outputs'])
        self.assertIn('720', payload['youtube_video_qualities'])
        self.assertIn('192', payload['youtube_audio_qualities'])

    def test_convert_api_reports_errors_as_json_for_fetch_clients(self):
        response = self.client.post('/api/convert')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], 'No file or YouTube URL provided')


if __name__ == '__main__':
    unittest.main()
