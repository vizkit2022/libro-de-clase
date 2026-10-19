"""Documentos del alumno: subida multipart, descarga, edición, reemplazo, límites y permisos."""
from urllib.parse import quote

import pytest

from conftest import as_list, file_tuple, unwrap

PDF_BYTES = b'%PDF-1.4\n%fake pdf para tests\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


def _upload(client, h, sid, content=PDF_BYTES, filename='certificado.pdf', **fields):
    data = {'file': file_tuple(content, filename)}
    data.update(fields)
    return client.post(f'/api/students/{sid}/documents', headers=h, data=data,
                       content_type='multipart/form-data')


def _list(client, h, sid):
    r = client.get(f'/api/students/{sid}/documents', headers=h)
    assert r.status_code == 200
    return as_list(r.get_json(), 'documents')


def test_upload_list_download(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    r = _upload(client, h, sid, title='Certificado', category='Certificado de nacimiento',
                description='Original')
    assert r.status_code == 201, r.get_data(as_text=True)
    doc = unwrap(r.get_json(), 'document')
    assert 'content' not in doc
    assert doc['filename'] == 'certificado.pdf'
    assert doc['title'] == 'Certificado'
    assert doc['category'] == 'Certificado de nacimiento'
    assert doc['description'] == 'Original'
    assert doc['size_bytes'] == len(PDF_BYTES)
    assert 'pdf' in (doc['mime_type'] or '')
    assert doc['uploaded_by_name']
    assert doc['created_at']

    lst = _list(client, h, sid)
    assert [d['id'] for d in lst] == [doc['id']]
    assert all('content' not in d for d in lst)

    ficha = client.get(f'/api/students/{sid}/ficha', headers=h).get_json()
    assert [d['id'] for d in ficha['documents']] == [doc['id']]
    assert all('content' not in d for d in ficha['documents'])

    r = client.get(f"/api/students/{sid}/documents/{doc['id']}/download", headers=h)
    assert r.status_code == 200
    assert r.data == PDF_BYTES
    assert 'pdf' in r.headers['Content-Type']
    cd = r.headers.get('Content-Disposition', '')
    assert cd.startswith('attachment'), cd
    assert 'certificado.pdf' in cd


def test_default_title_is_filename(client, headers, make_student):
    sid = make_student()
    r = _upload(client, headers['admin'], sid, filename='informe.pdf')
    assert r.status_code == 201
    doc = unwrap(r.get_json(), 'document')
    assert doc['title'] == 'informe.pdf'


def test_download_utf8_filename_and_inline(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    r = _upload(client, h, sid, content=b'\x89PNG\r\n\x1a\nfake', filename='informe_médico.png',
                category='Informe médico')
    assert r.status_code == 201, r.get_data(as_text=True)
    doc = unwrap(r.get_json(), 'document')
    assert doc['filename'] == 'informe_médico.png'
    r = client.get(f"/api/students/{sid}/documents/{doc['id']}/download", headers=h)
    cd = r.headers['Content-Disposition']
    assert cd.startswith('attachment')
    assert "filename*=UTF-8''" + quote('informe_médico.png') in cd, cd
    r = client.get(f"/api/students/{sid}/documents/{doc['id']}/download?inline=1", headers=h)
    assert r.status_code == 200
    assert r.headers['Content-Disposition'].startswith('inline')
    assert r.headers['Content-Type'].startswith('image/png')


def test_put_json_updates_metadata(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    doc = unwrap(_upload(client, h, sid).get_json(), 'document')
    r = client.put(f"/api/students/{sid}/documents/{doc['id']}", headers=h,
                   json={'title': 'Nuevo título', 'category': 'Otro', 'description': 'Editado'})
    assert r.status_code == 200, r.get_data(as_text=True)
    upd = unwrap(r.get_json(), 'document')
    assert upd['title'] == 'Nuevo título'
    assert upd['category'] == 'Otro'
    assert upd['description'] == 'Editado'
    assert upd['size_bytes'] == len(PDF_BYTES)
    assert 'content' not in upd
    # El contenido no cambia
    r = client.get(f"/api/students/{sid}/documents/{doc['id']}/download", headers=h)
    assert r.data == PDF_BYTES


def test_put_multipart_replaces_file(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    doc = unwrap(_upload(client, h, sid).get_json(), 'document')
    new_bytes = b'\x89PNG\r\n\x1a\n' + b'0' * 500
    r = client.put(f"/api/students/{sid}/documents/{doc['id']}", headers=h,
                   data={'file': file_tuple(new_bytes, 'reemplazo.png'), 'title': 'Reemplazado'},
                   content_type='multipart/form-data')
    assert r.status_code == 200, r.get_data(as_text=True)
    upd = unwrap(r.get_json(), 'document')
    assert upd['size_bytes'] == len(new_bytes) != doc['size_bytes']
    assert upd['filename'] == 'reemplazo.png'
    assert upd['title'] == 'Reemplazado'
    assert 'png' in (upd['mime_type'] or '')
    r = client.get(f"/api/students/{sid}/documents/{doc['id']}/download", headers=h)
    assert r.data == new_bytes


def test_put_multipart_bad_extension_400(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    doc = unwrap(_upload(client, h, sid).get_json(), 'document')
    r = client.put(f"/api/students/{sid}/documents/{doc['id']}", headers=h,
                   data={'file': file_tuple(b'MZ', 'virus.exe')}, content_type='multipart/form-data')
    assert r.status_code == 400


@pytest.mark.parametrize('filename', ['malware.exe', 'script.sh', 'sinextension', 'pagina.html'])
def test_upload_bad_extension_400(client, headers, make_student, filename):
    sid = make_student()
    r = _upload(client, headers['admin'], sid, content=b'xx', filename=filename)
    assert r.status_code == 400
    assert 'error' in r.get_json()


@pytest.mark.parametrize('filename', ['a.jpg', 'b.JPEG', 'c.docx', 'd.xlsx', 'e.txt', 'f.heic',
                                      'g.webp', 'h.gif', 'i.doc', 'j.xls', 'k.PDF'])
def test_upload_allowed_extensions(client, headers, make_student, filename):
    sid = make_student()
    r = _upload(client, headers['admin'], sid, content=b'contenido', filename=filename)
    assert r.status_code == 201, (filename, r.get_data(as_text=True))


def test_upload_without_file_400(client, headers, make_student):
    sid = make_student()
    r = client.post(f'/api/students/{sid}/documents', headers=headers['admin'],
                    data={'title': 'Sin archivo'}, content_type='multipart/form-data')
    assert r.status_code == 400


def test_upload_empty_filename_400(client, headers, make_student):
    sid = make_student()
    r = _upload(client, headers['admin'], sid, content=b'', filename='')
    assert r.status_code == 400


def test_upload_too_large(client, headers, make_student):
    sid = make_student()
    big = b'0' * (10 * 1024 * 1024 + 10)
    r = _upload(client, headers['admin'], sid, content=big, filename='grande.pdf')
    assert r.status_code in (400, 413)
    if r.is_json:
        assert 'error' in r.get_json()
    assert _list(client, headers['admin'], sid) == []


def test_delete_then_404(client, headers, make_student):
    h = headers['admin']
    sid = make_student()
    doc = unwrap(_upload(client, h, sid).get_json(), 'document')
    r = client.delete(f"/api/students/{sid}/documents/{doc['id']}", headers=h)
    assert r.status_code in (200, 204)
    assert client.get(f"/api/students/{sid}/documents/{doc['id']}/download",
                      headers=h).status_code == 404
    assert client.put(f"/api/students/{sid}/documents/{doc['id']}", headers=h,
                      json={'title': 'x'}).status_code == 404
    assert _list(client, h, sid) == []


def test_document_of_other_student_404(client, headers, make_student):
    h = headers['admin']
    sid1, sid2 = make_student(), make_student()
    doc = unwrap(_upload(client, h, sid1).get_json(), 'document')
    assert client.get(f"/api/students/{sid2}/documents/{doc['id']}/download",
                      headers=h).status_code == 404


def test_permissions_on_documents(client, headers, ids):
    sid = ids['pedro']
    doc = unwrap(_upload(client, headers['admin'], sid).get_json(), 'document')
    url = f"/api/students/{sid}/documents/{doc['id']}/download"
    # Ver/descargar: apoderado vinculado, alumno propio, profesor
    for role in ('apoderado', 'alumno', 'profesor', 'directivo'):
        r = client.get(url, headers=headers[role])
        assert r.status_code == 200, role
        assert r.data == PDF_BYTES
    # Subir / editar / borrar: solo admin/directivo
    for role in ('profesor', 'apoderado', 'alumno'):
        assert _upload(client, headers[role], sid).status_code == 403, role
        assert client.delete(f"/api/students/{sid}/documents/{doc['id']}",
                             headers=headers[role]).status_code == 403
    r = _upload(client, headers['directivo'], sid, filename='dir.pdf')
    assert r.status_code == 201
